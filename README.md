# discord-bots-manager

Spawn, monitor, and manage multiple Discord bot processes from a single Node.js process.

Each bot runs in its own isolated child process (`child_process.fork`), so a crash in one bot never affects the others. The manager handles auto-restarts, IPC communication, and graceful shutdown.

## Features

- **Discord Bot Management** — manage multiple Discord bots from a single manager process
- **Multi-Process Isolation** — each bot runs in its own OS process via `child_process.fork`
- **Auto-Restart** — automatic restart on crash with configurable delay and max retry count
- **IPC Communication** — send and receive messages between the manager and any bot process
- **Cluster & Sharding Ready** — built for sharded and clustered Discord bot architectures
- **Process Lifecycle Control** — start, stop, and restart individual bots or all at once
- **Graceful Shutdown** — sends shutdown signal, then SIGKILL after configurable timeout
- **Status Monitoring** — query real-time PID, status, uptime, and restart count per bot
- **Event System** — rich lifecycle events: `start`, `ready`, `crash`, `restart`, `stop`, `error`
- **TypeScript First** — full type declarations included out of the box

## Install

```bash
npm install discord-bots-manager
```

> **Peer dependency:** requires `discord.js@^14`

## Quick Start

### Manager (index.js)

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

manager.startAll()

process.on('SIGINT', () => {
  manager.stopAll()
  process.exit(0)
})
```

### Bot worker (bot.js)

This is the script the manager forks. It receives `BOT_NAME`, `BOT_TOKEN`, and `BOT_INTENTS` via environment variables.

```ts
import { Client, GatewayIntentBits } from 'discord.js'
import type { IPCMessage } from 'discord-bots-manager'

const client = new Client({
  intents: Number(process.env.BOT_INTENTS) || GatewayIntentBits.Guilds,
})

client.once('ready', () => {
  // Notify the manager that the bot is online
  process.send?.({ type: 'ready', from: 'worker', botName: process.env.BOT_NAME, timestamp: Date.now() })
})

// Listen for messages from the manager
process.on('message', (msg: IPCMessage) => {
  if (msg.type === 'shutdown') {
    client.destroy()
    process.exit(0)
  }
})

client.login(process.env.BOT_TOKEN)
```

## API

### `Manager`

| Method | Description |
|---|---|
| `startAll()` | Start all registered bots |
| `start(name)` | Start a specific bot |
| `stopAll()` | Stop all bots gracefully |
| `stop(name)` | Stop a specific bot |
| `restartAll()` | Restart all bots |
| `restart(name)` | Restart a specific bot |
| `addBot(config)` | Register a new bot at runtime |
| `removeBot(name)` | Stop and remove a bot |
| `sendTo(name, type, payload?)` | Send IPC message to a specific bot |
| `broadcast(type, payload?)` | Send IPC message to all bots |
| `status()` | Get status array for all bots |
| `statusOf(name)` | Get status of one bot |

### Events

| Event | Payload |
|---|---|
| `bot:start` | `string` (name) |
| `bot:ready` | `string` (name) |
| `bot:crash` | `{ name, code, signal }` |
| `bot:restart` | `string` (name) |
| `bot:stop` | `string` (name) |
| `bot:error` | `{ name, error }` |
| `bot:message` | `(msg: IPCMessage, name: string)` |

### `BotConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Unique identifier for the bot |
| `token` | `string` | — | Discord bot token (injected as `BOT_TOKEN` env) |
| `script` | `string` | — | Path to the worker script |
| `intents` | `number` | `0` | Discord.js intents bitfield |
| `env` | `Record<string, string>` | `{}` | Extra env variables |
| `restartDelay` | `number` | `2000` | Delay before restart (ms) |
| `maxRestarts` | `number` | `Infinity` | Max auto-restart attempts |

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
