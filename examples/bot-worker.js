/**
 * This is an example Discord.js bot worker.
 * The Manager forks this script as a child process.
 *
 * Environment variables set by the Manager:
 *   - BOT_NAME
 *   - BOT_TOKEN
 *   - BOT_INTENTS
 */

const { Client, GatewayIntentBits } = require('discord.js')

const token = process.env.BOT_TOKEN
const botName = process.env.BOT_NAME || 'unknown'
const intents = Number(process.env.BOT_INTENTS) || GatewayIntentBits.Guilds

if (!token) {
  console.error(`[${botName}] BOT_TOKEN not set`)
  process.exit(1)
}

const client = new Client({ intents })

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
  console.log(`[${botName}] Received from manager:`, msg)
})

client.login(token)
