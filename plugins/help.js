export default {
  name: 'help',
  description: 'Get help for a specific command',
  category: 'general',

  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    const commandName = args[0];

    if (!commandName) {
      return await sock.sendMessage(sender, {
        text: `❌ Usage: ${prefix}help <command>\nExample: ${prefix}help ping`
      });
    }

    const pluginsCol = db.collection('plugins');
    const plugin = await pluginsCol.findOne({ name: commandName });

    if (!plugin) {
      return await sock.sendMessage(sender, {
        text: `❌ Command "${commandName}" not found.\nUse ${prefix}menu to see all commands.`
      });
    }

    const helpText = `*📖 COMMAND HELP*

*Name:* ${plugin.name}
*Description:* ${plugin.description || 'No description'}
*Category:* ${plugin.category || 'general'}
*Aliases:* ${plugin.aliases?.join(', ') || 'None'}
*Usage:* ${prefix}${plugin.name} ${plugin.usage || ''}

${plugin.example ? `*Example:*\n${prefix}${plugin.example}` : ''}`;

    await sock.sendMessage(sender, { text: helpText });
  }
};
