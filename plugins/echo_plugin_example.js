// plugins/echo.js - Simple example plugin

export default {
  name: 'echo',
  description: 'Repeats your message back to you',
  aliases: ['repeat', 'say'],
  category: 'fun',
  usage: '<text>',
  example: 'echo Hello World!',
  version: '1.0.0',

  async run({ msg, args, sock, prefix }) {
    const sender = msg.key.remoteJid;

    // Check if user provided text
    if (args.length === 0) {
      return await sock.sendMessage(sender, {
        text: `❌ Please provide text to echo!\n\n*Usage:* ${prefix}echo <text>\n*Example:* ${prefix}echo Hello World!`
      });
    }

    // Join all arguments into a single string
    const text = args.join(' ');

    // Send the echo response with a fun format
    const echoMessage = `🔊 *ECHO*\n\n"${text}"`;

    await sock.sendMessage(sender, {
      text: echoMessage
    });

    // React to the original message
    await sock.sendMessage(sender, {
      react: {
        text: '🔊',
        key: msg.key
      }
    });
  }
};
