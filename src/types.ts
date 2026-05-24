export interface BotConfig {
  name: string
  token: string
  intents?: number
  script: string
  env?: Record<string, string>
  restartDelay?: number
  maxRestarts?: number
}

export interface BotStatus {
  name: string
  pid: number | null
  status: 'starting' | 'running' | 'stopped' | 'crashed'
  uptime: number | null
  restarts: number
  lastRestart: number | null
}

export interface ManagerOptions {
  bots: BotConfig[]
  maxConcurrentRestarts?: number
}

export interface IPCMessage {
  type: string
  payload?: unknown
  from: 'manager' | 'worker'
  botName: string
  timestamp: number
}

export type BotEvent = 'start' | 'stop' | 'crash' | 'restart' | 'ready' | 'error' | 'message'
