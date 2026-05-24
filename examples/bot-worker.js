const { Client, GatewayIntentBits } = require('discord.js')

const token = process.env.BOT_TOKEN
const botName = process.env.BOT_NAME || 'unknown'
const intents = Number(process.env.BOT_INTENTS) || GatewayIntentBits.Guilds
const shardId = process.env.SHARD_ID ? Number(process.env.SHARD_ID) : undefined
const shardCount = process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : undefined

if (!token) {
  console.error(`[${botName}] BOT_TOKEN not set`)
  process.exit(1)
}

const shardInfo = shardId !== undefined ? { id: shardId, count: shardCount } : undefined
const client = new Client({ intents, shards: shardInfo })

client.once('ready', () => {
  console.log(`[${botName}] Logged in as ${client.user.tag}`)
  if (process.send) {
    process.send({ type: 'ready', from: 'worker', botName, timestamp: Date.now() })
  }
})

client.on('messageCreate', (message) => {
  if (message.content === '!ping') {
    message.reply('Pong!')
  }
})

process.on('message', (msg) => {
  if (msg.type === 'shutdown') {
    console.log(`[${botName}] Shutting down...`)
    client.destroy()
    process.exit(0)
  }
  if (msg.type === 'ping') {
    if (process.send) {
      process.send({ type: 'pong', from: 'worker', botName, timestamp: Date.now() })
    }
    return
  }
  console.log(`[${botName}] Received from manager:`, msg)
})

client.login(token)
