/**
 * Example usage of discord-bot-manager.
 * Run: node examples/manager.js
 *
 * Make sure to build the library first: npm run build
 */

const { Manager } = require('../dist/index.js')

const manager = new Manager({
  bots: [
    {
      name: 'bot-moderation',
      token: 'YOUR_BOT_TOKEN_HERE',
      script: './examples/bot-worker.js',
      restartDelay: 3000,
      maxRestarts: 5
    },
    {
      name: 'bot-music',
      token: 'YOUR_BOT_TOKEN_HERE',
      script: './examples/bot-worker.js',
      restartDelay: 3000,
      maxRestarts: 5
    }
  ]
})

manager.on('bot:start', (name) => console.log(`[Manager] ${name} started`))
manager.on('bot:ready', (name) => console.log(`[Manager] ${name} is ready`))
manager.on('bot:crash', ({ name, code }) =>
  console.log(`[Manager] ${name} crashed with code ${code}`))
manager.on('bot:restart', (name) => console.log(`[Manager] Restarting ${name}...`))
manager.on('bot:error', ({ name, error }) =>
  console.log(`[Manager] ${name} error: ${error}`))

manager.startAll()

process.on('SIGINT', () => {
  console.log('\n[Manager] Shutting down all bots...')
  manager.stopAll()
  process.exit(0)
})

// Log status every 30s
setInterval(() => {
  console.log('[Manager] Status:', JSON.stringify(manager.status(), null, 2))
}, 30000)
