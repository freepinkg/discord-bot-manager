# discord-bots-manager

Spawn, monitor, and manage multiple Discord bot processes from a single Node.js process.

Each bot runs in its own isolated child process (`child_process.fork`), so a crash in one bot never affects the others. The manager handles auto-restarts, heartbeat health checks, IPC communication, and graceful shutdown with exponential backoff.

## Features

- **Multi-Process Isolation** — each bot runs in its own OS process via `child_process.fork`
- **Sharding Support** — auto-spawn N shard processes from a single config, passes `SHARD_ID`/`SHARD_COUNT` env vars
- **Heartbeat Health Check** — manager pings workers every 30s, detects unresponsive bots
- **Auto-Restart with Backoff** — exponential backoff (2s → 3s → 4.5s → ... up to 30s) on crash
- **IPC Communication** — send and receive typed messages between manager and any worker
- **Startup Timeout Detection** — if a bot doesn't signal `ready` within 30s, it's auto-restarted
- **Graceful 2-Phase Shutdown** — SIGTERM first, then SIGKILL after configurable timeout
- **Stdout/Stderr Capture** — logs are buffered and accessible via `getLogs()`
- **Batch Operations** — `startBatch()`, `stopBatch()`, `restartBatch()` with arrays of bot names
- **TypeScript** — full type declarations included

## Install

```bash
npm install discord-bots-manager
```

> **Peer dependency:** requires `discord.js@^14`

## Quick Start

### Manager

```ts
import { Manager } from 'discord-bots-manager'

const manager = new Manager({
  bots: [
    {
      name: 'mod-bot',
      token: process.env.MOD_BOT_TOKEN!,
      script: './bot.js',
    },
    {
      name: 'music-bot',
      token: process.env.MUSIC_BOT_TOKEN!,
      script: './bot.js',
      restartDelay: 5000,
      maxRestarts: 3,
    },
  ],
})

manager.on('bot:ready', (name) => console.log(`${name} is online`))
manager.on('bot:crash', ({ name, code }) =>
  console.error(`${name} crashed (exit ${code})`))
manager.on('bot:unresponsive', (name) =>
  console.warn(`${name} is not responding to heartbeats`))

manager.startAll()

process.on('SIGINT', () => {
  manager.stopAll()
  process.exit(0)
})
```

### With sharding

```ts
const manager = new Manager({
  bots: [
    {
      name: 'main-bot',
      token: 'YOUR_TOKEN',
      script: './bot.js',
      shardCount: 3,
    },
  ],
})

// Spawns 3 processes: main-bot-shard-0, main-bot-shard-1, main-bot-shard-2
manager.startAll()

// Restart a specific shard
manager.restartShard('main-bot', 1)
```

### Bot worker (bot.js)

Receives `BOT_TOKEN`, `BOT_NAME`, `BOT_INTENTS`, `SHARD_ID`, and `SHARD_COUNT` via environment variables. Must respond to `ping` with `pong` for heartbeat.

```ts
import { Client, GatewayIntentBits } from 'discord.js'

const client = new Client({
  intents: Number(process.env.BOT_INTENTS) || GatewayIntentBits.Guilds,
  shards: process.env.SHARD_ID
    ? { id: Number(process.env.SHARD_ID), count: Number(process.env.SHARD_COUNT) }
    : undefined,
})

client.once('ready', () => {
  process.send?.({ type: 'ready', from: 'worker', botName: process.env.BOT_NAME, timestamp: Date.now() })
})

process.on('message', (msg: any) => {
  if (msg.type === 'shutdown') {
    client.destroy()
    process.exit(0)
  }
  if (msg.type === 'ping') {
    process.send?.({ type: 'pong', from: 'worker', botName: process.env.BOT_NAME, timestamp: Date.now() })
    return
  }
})

client.login(process.env.BOT_TOKEN)
```

### Batch operations

```ts
manager.startBatch(['mod-bot', 'music-bot'])
manager.restartBatch(['mod-bot-shard-0', 'mod-bot-shard-1'])
manager.stopBatch(['music-bot'])
```

## API

### `Manager`

| Method | Description |
|---|---|
| `startAll()` | Start all registered bots |
| `start(name)` | Start a specific bot |
| `startBatch(names)` | Start multiple bots by name |
| `stopAll()` | Stop all bots gracefully |
| `stop(name)` | Stop a specific bot |
| `stopBatch(names)` | Stop multiple bots by name |
| `restartAll()` | Restart all bots |
| `restart(name)` | Restart a specific bot |
| `restartBatch(names)` | Restart multiple bots by name |
| `restartShard(botName, shardId)` | Restart a single shard of a sharded bot |
| `addBot(config)` | Register a new bot at runtime |
| `removeBot(name)` | Stop and remove a bot |
| `sendTo(name, type, payload?)` | Send IPC message to a specific bot |
| `broadcast(type, payload?)` | Send IPC message to all bots |
| `status()` | Get status array for all bots |
| `statusOf(name)` | Get status of one bot |
| `getLogs(name)` | Get captured stdout/stderr buffers |

### Events

| Event | Payload |
|---|---|
| `bot:start` | `string` (name) |
| `bot:ready` | `string` (name) |
| `bot:crash` | `{ name, code, signal }` |
| `bot:restart` | `string` (name) |
| `bot:stop` | `string` (name) |
| `bot:error` | `{ name, error }` |
| `bot:unresponsive` | `string` (name) |
| `bot:heartbeat` | `string` (name) |
| `bot:message` | `(msg: IPCMessage, name: string)` |
| `shard:start` | `string` (name) |
| `shard:ready` | `string` (name) |
| `shard:crash` | `{ name, code, signal }` |
| `shard:restart` | `string` (name) |
| `shard:stop` | `string` (name) |
| `shard:error` | `{ name, error }` |
| `shard:unresponsive` | `string` (name) |
| `shard:message` | `(msg: IPCMessage, name: string)` |

### `BotConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Unique identifier for the bot |
| `token` | `string` | — | Discord bot token (injected as `BOT_TOKEN` env) |
| `script` | `string` | — | Path to the worker script |
| `intents` | `number` | `0` | Discord.js intents bitfield |
| `env` | `Record<string, string>` | `{}` | Extra env variables |
| `restartDelay` | `number` | `2000` | Base delay before restart (ms) |
| `maxRestarts` | `number` | `Infinity` | Max auto-restart attempts |
| `shardId` | `number` | — | Shard index (set automatically with shardCount) |
| `shardCount` | `number` | — | Total shards; auto-creates N processes if > 1 |
| `shutdownTimeout` | `number` | `5000` | Time to wait before SIGTERM then SIGKILL |

### `ManagerOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `bots` | `BotConfig[]` | — | Array of bot configurations |
| `heartbeatInterval` | `number` | `30000` | Ping interval in ms |
| `startupTimeout` | `number` | `30000` | Max ms to wait for `ready` signal |
| `maxConcurrentRestarts` | `number` | `3` | Max simultaneous restarts |

## Examples

Clone the repo and run:

```bash
npm install
npm run build
node examples/manager.js
```

See the [examples](./examples) directory for a complete manager + worker setup.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
