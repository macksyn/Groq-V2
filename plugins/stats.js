export default {
  name: 'stats',
  description: 'Display bot statistics',
  aliases: ['statistics', 'info'],
  category: 'general',

  async run({ msg, sock, db }) {
    const sender = msg.key.remoteJid;
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const stats = `*📊 BOT STATISTICS*

⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
💾 *Memory:* ${Math.round(memory.heapUsed / 1024 / 1024)}MB
🔌 *Plugins:* ${await db.collection('plugins').countDocuments()}
👥 *Users:* ${await db.collection('users').countDocuments()}
💬 *Messages:* ${await db.collection('messages').countDocuments()}

━━━━━━━━━━━━━━━━━━
🤖 *Groq Bot Framework v2.0*
━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(sender, { text: stats });
  }
};
