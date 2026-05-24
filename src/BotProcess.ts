import { ChildProcess, fork } from 'child_process'
import { EventEmitter } from 'events'
import { BotConfig, BotStatus, IPCMessage } from './types'

export class BotProcess extends EventEmitter {
  public config: BotConfig
  public process: ChildProcess | null = null
  public restarts = 0
  public lastRestart: number | null = null
  public startTime: number | null = null
  private manualStop = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: BotConfig) {
    super()
    this.config = config
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
    return 'running'
  }

  get uptime(): number | null {
    if (this.startTime === null) return null
    if (this.process === null || this.process.killed) return (Date.now() - this.startTime)
    return Date.now() - this.startTime
  }

  toStatus(): BotStatus {
    return {
      name: this.config.name,
      pid: this.pid,
      status: this.status,
      uptime: this.uptime,
      restarts: this.restarts,
      lastRestart: this.lastRestart
    }
  }

  start(): void {
    this.manualStop = false
    this.startTime = Date.now()
    this.lastRestart = Date.now()

    const env: Record<string, string | undefined> = {
      ...process.env as Record<string, string>,
      ...this.config.env,
      BOT_NAME: this.config.name,
      BOT_TOKEN: this.config.token,
      BOT_INTENTS: String(this.config.intents ?? 0)
    }

    this.process = fork(this.config.script, [], {
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    this.process.on('message', (msg: IPCMessage) => {
      if (msg.type === 'ready') {
        this.emit('ready', this.config.name)
      }
      this.emit('message', msg, this.config.name)
    })

    this.process.on('exit', (code, signal) => {
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

    this.emit('start', this.config.name)
  }

  stop(): void {
    this.manualStop = true
    this.clearRestartTimer()
    if (!this.process) return
    this.send({ type: 'shutdown', from: 'manager', botName: this.config.name, timestamp: Date.now() })
    const killTimeout = setTimeout(() => {
      this.process?.kill('SIGKILL')
    }, 5000)
    this.process.once('exit', () => clearTimeout(killTimeout))
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

  private scheduleRestart(): void {
    const delay = this.config.restartDelay ?? 2000
    const max = this.config.maxRestarts ?? Infinity
    if (this.restarts >= max) {
      this.emit('error', { name: this.config.name, error: `Max restarts (${max}) reached` })
      return
    }
    this.restarts++
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
