export interface BotConfig {
  name: string
  token: string
  intents?: number
  script: string
  env?: Record<string, string>
  restartDelay?: number
  maxRestarts?: number
  shutdownTimeout?: number
  shardId?: number
  shardCount?: number
}

export interface BotStatus {
  name: string
  pid: number | null
  status: 'starting' | 'running' | 'stopped' | 'crashed' | 'unresponsive'
  uptime: number | null
  restarts: number
  lastRestart: number | null
  shardId?: number
  shardCount?: number
  memory?: number
  cpu?: number
}

export interface ManagerOptions {
  bots: BotConfig[]
  heartbeatInterval?: number
  startupTimeout?: number
  maxConcurrentRestarts?: number
}

export interface IPCMessage {
  type: string
  payload?: unknown
  from: 'manager' | 'worker'
  botName: string
  timestamp: number
}

export type BotEvent = 'start' | 'stop' | 'crash' | 'restart' | 'ready' | 'error' | 'message' | 'unresponsive' | 'heartbeat'
