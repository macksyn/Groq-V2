import { sendButton } from '../src/utils/helpers.js';

export default {
  name: 'menu',
  description: 'Display bot menu with all commands',
  aliases: ['help', 'commands'],
  category: 'general',

  async run({ msg, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    const pluginsCol = db.collection('plugins');
    
    // Get all enabled plugins
    const enabledPlugins = await pluginsCol.find({ enabled: true }).toArray();
    
    // Group by category
    const categories = {};
    
    for (const plugin of enabledPlugins) {
      const category = plugin.category || 'general';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({
        name: plugin.name,
        description: plugin.description || 'No description'
      });
    }

    // Build menu text
    let menuText = `╭─────────────────╮
│  *GROQ BOT MENU*  │
╰─────────────────╯

`;

    for (const [category, plugins] of Object.entries(categories)) {
      menuText += `\n*${category.toUpperCase()}*\n`;
      plugins.forEach(p => {
        menuText += `• ${prefix}${p.name}\n  └ ${p.description}\n`;
      });
    }

    menuText += `
\n━━━━━━━━━━━━━━━━━━
📊 Total Commands: ${enabledPlugins.length}
🤖 Bot Version: 2.0.0
━━━━━━━━━━━━━━━━━━`;

    await sendButton(sock, sender, {
      text: menuText,
      footer: 'Powered by Groq Framework',
      buttons: [
        { id: 'ping', text: '🏓 Ping' },
        { id: 'stats', text: '📊 Stats' }
      ]
    });
  }
};
