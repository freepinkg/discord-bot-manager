import { ChildProcess, fork } from 'child_process'
import { EventEmitter } from 'events'
import { BotConfig, BotStatus, IPCMessage } from './types'

export class BotProcess extends EventEmitter {
  public config: BotConfig
  public process: ChildProcess | null = null
  public restarts = 0
  public lastRestart: number | null = null
  public startTime: number | null = null
  public stdoutBuffer: string[] = []
  public stderrBuffer: string[] = []
  private manualStop = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private lastHeartbeat: number = 0
  private heartbeatIntervalMs: number
  private startupTimeoutMs: number
  private backoffBase: number

  constructor(config: BotConfig, heartbeatInterval = 30000, startupTimeout = 30000) {
    super()
    this.config = config
    this.heartbeatIntervalMs = heartbeatInterval
    this.startupTimeoutMs = startupTimeout
    this.backoffBase = config.restartDelay ?? 2000
  }

  get pid(): number | null {
    return this.process?.pid ?? null
  }

  get status(): BotStatus['status'] {
    if (this.process === null) return 'stopped'
    if (this.process.killed) return 'stopped'
    if (this.process.exitCode !== null && !this.manualStop) return 'crashed'
    if (this.process.exitCode !== null) return 'stopped'
    if (this.startTime === null) return 'starting'
    if (this.lastHeartbeat > 0 && Date.now() - this.lastHeartbeat > this.heartbeatIntervalMs * 2) {
      return 'unresponsive'
    }
    return 'running'
  }

  get uptime(): number | null {
    if (this.startTime === null) return null
    if (this.process === null || this.process.killed) return Date.now() - this.startTime
    return Date.now() - this.startTime
  }

  toStatus(): BotStatus {
    return {
      name: this.config.name,
      pid: this.pid,
      status: this.status,
      uptime: this.uptime,
      restarts: this.restarts,
      lastRestart: this.lastRestart,
      shardId: this.config.shardId,
      shardCount: this.config.shardCount
    }
  }

  start(): void {
    this.manualStop = false
    this.startTime = Date.now()
    this.lastRestart = Date.now()
    this.stdoutBuffer = []
    this.stderrBuffer = []

    const env: Record<string, string | undefined> = {
      ...process.env as Record<string, string>,
      ...this.config.env,
      BOT_NAME: this.config.name,
      BOT_TOKEN: this.config.token,
      BOT_INTENTS: String(this.config.intents ?? 0)
    }

    if (this.config.shardId !== undefined) {
      env.SHARD_ID = String(this.config.shardId)
    }
    if (this.config.shardCount !== undefined) {
      env.SHARD_COUNT = String(this.config.shardCount)
    }

    this.process = fork(this.config.script, [], {
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    this.captureStdio()

    this.process.on('message', (msg: IPCMessage) => {
      if (msg.type === 'ready') {
        this.clearStartupTimer()
        this.emit('ready', this.config.name)
      }
      if (msg.type === 'pong') {
        this.lastHeartbeat = Date.now()
        this.emit('heartbeat', this.config.name)
      }
      this.emit('message', msg, this.config.name)
    })

    this.process.on('exit', (code, signal) => {
      this.stopHeartbeat()
      this.clearStartupTimer()
      const crashed = !this.manualStop
      this.emit('exit', { name: this.config.name, code, signal, crashed })
      if (crashed) {
        this.emit('crash', { name: this.config.name, code, signal })
        this.scheduleRestart()
      }
      this.process = null
      this.startTime = null
    })

    this.process.on('error', (err) => {
      this.emit('error', { name: this.config.name, error: err.message })
    })

    this.startHeartbeat()
    this.startStartupTimer()
    this.emit('start', this.config.name)
  }

  stop(): void {
    this.manualStop = true
    this.clearRestartTimer()
    if (!this.process) return
    const timeout = this.config.shutdownTimeout ?? 5000
    this.send({ type: 'shutdown', from: 'manager', botName: this.config.name, timestamp: Date.now() })
    const killTimeout = setTimeout(() => {
      this.process?.kill('SIGTERM')
      setTimeout(() => {
        this.process?.kill('SIGKILL')
      }, 3000)
    }, timeout)
    this.process.once('exit', () => {
      clearTimeout(killTimeout)
      this.emit('stop', this.config.name)
    })
    this.process?.disconnect()
  }

  restart(): void {
    this.manualStop = true
    this.clearRestartTimer()
    if (this.process) {
      this.process.once('exit', () => {
        this.manualStop = false
        this.start()
      })
      this.stop()
    } else {
      this.manualStop = false
      this.start()
    }
  }

  send(msg: Omit<IPCMessage, 'from'> & { from?: 'manager' | 'worker' }): boolean {
    if (!this.process || !this.process.connected) return false
    return this.process.send({ ...msg, from: 'manager' })
  }

  private captureStdio(): void {
    if (this.process?.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        this.stdoutBuffer.push(...lines)
        if (this.stdoutBuffer.length > 100) this.stdoutBuffer.splice(0, 50)
      })
    }
    if (this.process?.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        this.stderrBuffer.push(...lines)
        if (this.stderrBuffer.length > 100) this.stderrBuffer.splice(0, 50)
      })
    }
  }

  private startHeartbeat(): void {
    this.lastHeartbeat = Date.now()
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', from: 'manager', botName: this.config.name, timestamp: Date.now() })
      if (Date.now() - this.lastHeartbeat > this.heartbeatIntervalMs * 2) {
        this.emit('unresponsive', this.config.name)
      }
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private startStartupTimer(): void {
    this.startupTimer = setTimeout(() => {
      this.emit('error', { name: this.config.name, error: 'Startup timeout - bot did not signal ready' })
      if (this.process) {
        this.process.kill('SIGTERM')
      }
    }, this.startupTimeoutMs)
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer)
      this.startupTimer = null
    }
  }

  private scheduleRestart(): void {
    const max = this.config.maxRestarts ?? Infinity
    if (this.restarts >= max) {
      this.emit('error', { name: this.config.name, error: `Max restarts (${max}) reached` })
      return
    }
    this.restarts++
    const delay = Math.min(this.backoffBase * Math.pow(1.5, this.restarts - 1), 30000)
    this.restartTimer = setTimeout(() => {
      this.emit('restart', this.config.name)
      this.start()
    }, delay)
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }
}
