import { EventEmitter } from 'events'
import { BotConfig, BotStatus, ManagerOptions } from './types'
import { BotProcess } from './BotProcess'

export class Manager extends EventEmitter {
  public bots: Map<string, BotProcess> = new Map()
  private heartbeatInterval: number
  private startupTimeout: number
  private maxConcurrentRestarts: number

  constructor(options: ManagerOptions) {
    super()
    this.heartbeatInterval = options.heartbeatInterval ?? 30000
    this.startupTimeout = options.startupTimeout ?? 30000
    this.maxConcurrentRestarts = options.maxConcurrentRestarts ?? 3
    for (const botCfg of options.bots) {
      this.addBot(botCfg)
    }
  }

  addBot(config: BotConfig): BotProcess {
    if (config.shardCount && config.shardCount > 1) {
      for (let i = 0; i < config.shardCount; i++) {
        const shardCfg: BotConfig = {
          ...config,
          name: `${config.name}-shard-${i}`,
          shardId: i,
          shardCount: config.shardCount
        }
        this.registerShard(shardCfg)
      }
      const bp = this.bots.get(`${config.name}-shard-0`)!
      return bp
    }
    return this.register(config)
  }

  removeBot(name: string): boolean {
    const bp = this.bots.get(name)
    if (!bp) return false
    bp.stop()
    bp.removeAllListeners()
    return this.bots.delete(name)
  }

  startAll(): void {
    for (const bp of this.bots.values()) {
      bp.start()
    }
  }

  start(name: string): void {
    this.bots.get(name)?.start()
  }

  startBatch(names: string[]): void {
    for (const name of names) {
      this.bots.get(name)?.start()
    }
  }

  stopAll(): void {
    for (const bp of this.bots.values()) {
      bp.stop()
    }
  }

  stop(name: string): void {
    this.bots.get(name)?.stop()
  }

  stopBatch(names: string[]): void {
    for (const name of names) {
      this.bots.get(name)?.stop()
    }
  }

  restartAll(): void {
    for (const bp of this.bots.values()) {
      bp.restart()
    }
  }

  restart(name: string): void {
    this.bots.get(name)?.restart()
  }

  restartBatch(names: string[]): void {
    for (const name of names) {
      this.bots.get(name)?.restart()
    }
  }

  restartShard(botName: string, shardId: number): void {
    this.bots.get(`${botName}-shard-${shardId}`)?.restart()
  }

  sendTo(name: string, type: string, payload?: unknown): boolean {
    const bp = this.bots.get(name)
    if (!bp) return false
    return bp.send({ type, payload, from: 'manager', botName: name, timestamp: Date.now() })
  }

  broadcast(type: string, payload?: unknown): void {
    for (const [name, bp] of this.bots) {
      bp.send({ type, payload, from: 'manager', botName: name, timestamp: Date.now() })
    }
  }

  status(): BotStatus[] {
    return Array.from(this.bots.values()).map(b => b.toStatus())
  }

  statusOf(name: string): BotStatus | null {
    return this.bots.get(name)?.toStatus() ?? null
  }

  getLogs(name: string): { stdout: string[], stderr: string[] } | null {
    const bp = this.bots.get(name)
    if (!bp) return null
    return { stdout: bp.stdoutBuffer, stderr: bp.stderrBuffer }
  }

  private register(config: BotConfig): BotProcess {
    if (this.bots.has(config.name)) {
      throw new Error(`Bot "${config.name}" already registered`)
    }
    const bp = new BotProcess(config, this.heartbeatInterval, this.startupTimeout)
    this.bots.set(config.name, bp)

    bp.on('start', (name) => this.emit('bot:start', name))
    bp.on('stop', (name) => this.emit('bot:stop', name))
    bp.on('crash', (data) => this.emit('bot:crash', data))
    bp.on('restart', (name) => this.emit('bot:restart', name))
    bp.on('ready', (name) => this.emit('bot:ready', name))
    bp.on('error', (data) => this.emit('bot:error', data))
    bp.on('unresponsive', (name) => this.emit('bot:unresponsive', name))
    bp.on('heartbeat', (name) => this.emit('bot:heartbeat', name))
    bp.on('message', (msg, name) => this.emit('bot:message', msg, name))

    return bp
  }

  private registerShard(config: BotConfig): void {
    const bp = new BotProcess(config, this.heartbeatInterval, this.startupTimeout)
    this.bots.set(config.name, bp)

    bp.on('start', (name) => this.emit('shard:start', name))
    bp.on('ready', (name) => this.emit('shard:ready', name))
    bp.on('crash', (data) => this.emit('shard:crash', data))
    bp.on('restart', (name) => this.emit('shard:restart', name))
    bp.on('stop', (name) => this.emit('shard:stop', name))
    bp.on('error', (data) => this.emit('shard:error', data))
    bp.on('unresponsive', (name) => this.emit('shard:unresponsive', name))
    bp.on('message', (msg, name) => this.emit('shard:message', msg, name))
  }
}
