import { EventEmitter } from 'events'
import { BotConfig, BotStatus, ManagerOptions } from './types'
import { BotProcess } from './BotProcess'

export class Manager extends EventEmitter {
  public bots: Map<string, BotProcess> = new Map()
  private maxConcurrentRestarts: number

  constructor(options: ManagerOptions) {
    super()
    this.maxConcurrentRestarts = options.maxConcurrentRestarts ?? 3
    for (const botCfg of options.bots) {
      this.addBot(botCfg)
    }
  }

  addBot(config: BotConfig): BotProcess {
    if (this.bots.has(config.name)) {
      throw new Error(`Bot "${config.name}" already registered`)
    }
    const bp = new BotProcess(config)
    this.bots.set(config.name, bp)

    bp.on('start', (name) => this.emit('bot:start', name))
    bp.on('stop', (name) => this.emit('bot:stop', name))
    bp.on('crash', (data) => this.emit('bot:crash', data))
    bp.on('restart', (name) => this.emit('bot:restart', name))
    bp.on('ready', (name) => this.emit('bot:ready', name))
    bp.on('error', (data) => this.emit('bot:error', data))
    bp.on('message', (msg, name) => this.emit('bot:message', msg, name))

    return bp
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

  stopAll(): void {
    for (const bp of this.bots.values()) {
      bp.stop()
    }
  }

  stop(name: string): void {
    this.bots.get(name)?.stop()
  }

  restartAll(): void {
    for (const bp of this.bots.values()) {
      bp.restart()
    }
  }

  restart(name: string): void {
    this.bots.get(name)?.restart()
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
}
