// plugins/menu.js - Auto-loads all plugin commands dynamically

export default {
  name: 'menu',
  description: 'Display bot menu with all available commands',
  aliases: ['help', 'commands', 'list'],
  category: 'general',

  async run({ msg, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    
    try {
      // Get PluginManager instance from the message context
      // We'll need to pass this through the plugin execution context
      const pluginsCol = db.collection('plugins');
      
      // Fetch all plugins from database
      const allPlugins = await pluginsCol.find({}).sort({ category: 1, name: 1 }).toArray();
      
      if (allPlugins.length === 0) {
        return await sock.sendMessage(sender, {
          text: '❌ No plugins found. Please restart the bot to load plugins.'
        });
      }

      // Group plugins by category
      const categories = {};
      let enabledCount = 0;
      let disabledCount = 0;

      for (const plugin of allPlugins) {
        const category = plugin.category || 'uncategorized';
        
        if (!categories[category]) {
          categories[category] = {
            enabled: [],
            disabled: []
          };
        }

        const pluginInfo = {
          name: plugin.name,
          description: plugin.description || 'No description available',
          aliases: plugin.aliases || [],
          usage: plugin.usage || '',
          ownerOnly: plugin.ownerOnly || false
        };

        if (plugin.enabled !== false) {
          categories[category].enabled.push(pluginInfo);
          enabledCount++;
        } else {
          categories[category].disabled.push(pluginInfo);
          disabledCount++;
        }
      }

      // Build the menu
      let menuText = this.buildHeader(enabledCount, disabledCount);
      
      // Add each category
      const sortedCategories = Object.keys(categories).sort();
      
      for (const category of sortedCategories) {
        const categoryData = categories[category];
        
        if (categoryData.enabled.length > 0) {
          menuText += this.buildCategorySection(
            category, 
            categoryData.enabled, 
            prefix
          );
        }
      }

      // Add footer
      menuText += this.buildFooter(prefix, enabledCount, disabledCount);

      // Send menu
      await sock.sendMessage(sender, { 
        text: menuText 
      });

      // Optional: Show disabled plugins if any
      if (disabledCount > 0) {
        setTimeout(async () => {
          let disabledText = `\n⚠️ *DISABLED PLUGINS* (${disabledCount})\n\n`;
          
          for (const category of sortedCategories) {
            const disabled = categories[category].disabled;
            if (disabled.length > 0) {
              disabledText += `*${category}:* `;
              disabledText += disabled.map(p => p.name).join(', ') + '\n';
            }
          }
          
          disabledText += `\n_These plugins are currently disabled and won't respond to commands._`;
          
          await sock.sendMessage(sender, { text: disabledText });
        }, 1000);
      }

    } catch (error) {
      console.error('Menu plugin error:', error);
      await sock.sendMessage(sender, {
        text: `❌ Error loading menu: ${error.message}`
      });
    }
  },

  /**
   * Build menu header
   */
  buildHeader(enabledCount, disabledCount) {
    const botName = process.env.BOT_NAME || 'Groq Bot';
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return `╭━━━━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *${botName.toUpperCase()}*
┃  📅 ${date}
╰━━━━━━━━━━━━━━━━━━━━━━╯

📋 *AVAILABLE COMMANDS*
✅ Active: ${enabledCount} | ⚠️ Disabled: ${disabledCount}

`;
  },

  /**
   * Build category section
   */
  buildCategorySection(category, plugins, prefix) {
    const icon = this.getCategoryIcon(category);
    let section = `┏━━ ${icon} *${category.toUpperCase()}* ━━┓\n`;

    plugins.forEach((plugin, index) => {
      const isLast = index === plugins.length - 1;
      const connector = isLast ? '┗' : '┣';
      
      // Command name with owner badge if needed
      const ownerBadge = plugin.ownerOnly ? ' 🔒' : '';
      section += `${connector}━ ${prefix}${plugin.name}${ownerBadge}\n`;
      
      // Description
      section += `┃  └ ${plugin.description}\n`;
      
      // Aliases if any
      if (plugin.aliases && plugin.aliases.length > 0) {
        const aliasText = plugin.aliases.map(a => `${prefix}${a}`).join(', ');
        section += `┃     ↳ Aliases: ${aliasText}\n`;
      }
      
      // Usage if specified
      if (plugin.usage) {
        section += `┃     ↳ Usage: ${prefix}${plugin.name} ${plugin.usage}\n`;
      }
    });

    section += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    return section;
  },

  /**
   * Build menu footer
   */
  buildFooter(prefix, enabledCount, disabledCount) {
    return `━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *TIPS:*
• Type ${prefix}help <command> for details
• Type ${prefix}stats for bot statistics
• 🔒 = Owner only commands

📊 *SUMMARY:*
• Total Commands: ${enabledCount + disabledCount}
• Active: ${enabledCount}
• Prefix: ${prefix}

⚡ Powered by Groq Framework v2.0
━━━━━━━━━━━━━━━━━━━━━━━━━`;
  },

  /**
   * Get icon for category
   */
  getCategoryIcon(category) {
    const icons = {
      general: '📱',
      owner: '👑',
      admin: '⚙️',
      utility: '🛠️',
      fun: '🎮',
      media: '🎬',
      download: '⬇️',
      search: '🔍',
      ai: '🤖',
      tools: '🔧',
      group: '👥',
      moderation: '🛡️',
      economy: '💰',
      games: '🎯',
      music: '🎵',
      info: 'ℹ️',
      system: '⚡'
    };

    return icons[category.toLowerCase()] || '📦';
  }
};