export default {
  name: 'ping',
  description: 'Check bot response time',
  aliases: ['p'],
  category: 'general',

  async run({ msg, sock }) {
    const start = Date.now();
    const sender = msg.key.remoteJid;
    
    await sock.sendMessage(sender, { text: '🏓 Pinging...' });
    
    const latency = Date.now() - start;
    
    await sock.sendMessage(sender, {
      text: `🏓 *Pong!*\n\n⏱️ Response Time: ${latency}ms`
    });
  }
};
