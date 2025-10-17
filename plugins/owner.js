import { isOwner } from '../src/utils/helpers.js';
import chalk from 'chalk';

export default {
  name: 'owner',
  description: 'Owner plugin management and bot settings',
  aliases: ['admin', 'sudo'],
  category: 'owner',
  ownerOnly: true,

  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    
    if (!isOwner(sender)) {
      return await sock.sendMessage(sender, {
        text: '❌ This command is only for the bot owner.'
      });
    }

    const subCommand = args[0]?.toLowerCase();
    const settingsCol = db.collection('settings');

    switch (subCommand) {
      case 'plugins':
        await handlePlugins(args[1], args[2], sock, sender, db);
        break;

      case 'prefix':
        if (!args[1]) {
          return await sock.sendMessage(sender, {
            text: `❌ Usage: ${prefix}owner prefix <new_prefix>`
          });
        }
        await settingsCol.updateOne(
          { key: 'prefix' },
          { $set: { value: args[1] } },
          { upsert: true }
        );
        await sock.sendMessage(sender, {
          text: `✅ Prefix updated to: ${args[1]}`
        });
        break;

      case 'setowner':
        if (!args[1]) {
          return await sock.sendMessage(sender, {
            text: `❌ Usage: ${prefix}owner setowner <number>`
          });
        }
        await settingsCol.updateOne(
          { key: 'owner' },
          { $set: { value: args[1] } },
          { upsert: true }
        );
        await sock.sendMessage(sender, {
          text: `✅ Owner number updated to: ${args[1]}`
        });
        break;

      case 'antilink':
        const status = args[1]?.toLowerCase() === 'on';
        await settingsCol.updateOne(
          { key: 'antilink' },
          { $set: { enabled: status } },
          { upsert: true }
        );
        await sock.sendMessage(sender, {
          text: `✅ Antilink ${status ? 'enabled' : 'disabled'}`
        });
        break;

      case 'welcome':
        const welcomeStatus = args[1]?.toLowerCase() === 'on';
        await settingsCol.updateOne(
          { key: 'welcome' },
          { $set: { enabled: welcomeStatus } },
          { upsert: true }
        );
        await sock.sendMessage(sender, {
          text: `✅ Welcome messages ${welcomeStatus ? 'enabled' : 'disabled'}`
        });
        break;

      case 'backup':
        await handleBackup(sock, sender, db);
        break;

      case 'stats':
        await handleStats(sock, sender, db);
        break;

      default:
        await sock.sendMessage(sender, {
          text: `*🔐 OWNER COMMANDS*

*Plugin Management:*
- ${prefix}owner plugins list
- ${prefix}owner plugins enable <name>
- ${prefix}owner plugins disable <name>

*Bot Settings:*
- ${prefix}owner prefix <new>
- ${prefix}owner setowner <number>
- ${prefix}owner antilink <on/off>
- ${prefix}owner welcome <on/off>

*System:*
- ${prefix}owner backup
- ${prefix}owner stats

All settings are persistent across restarts.`
        });
    }
  }
};

async function handlePlugins(action, pluginName, sock, sender, db) {
  const pluginsCol = db.collection('plugins');

  if (action === 'list') {
    const plugins = await pluginsCol.find({}).toArray();
    const list = plugins.map(p => 
      `• ${p.name} - ${p.enabled ? '✅ Enabled' : '❌ Disabled'}`
    ).join('\n');

    await sock.sendMessage(sender, {
      text: `*📦 INSTALLED PLUGINS*\n\n${list}`
    });
  } else if (action === 'enable' && pluginName) {
    await pluginsCol.updateOne(
      { name: pluginName },
      { $set: { enabled: true } },
      { upsert: true }
    );
    await sock.sendMessage(sender, {
      text: `✅ Plugin "${pluginName}" enabled`
    });
  } else if (action === 'disable' && pluginName) {
    await pluginsCol.updateOne(
      { name: pluginName },
      { $set: { enabled: false } },
      { upsert: true }
    );
    await sock.sendMessage(sender, {
      text: `✅ Plugin "${pluginName}" disabled`
    });
  }
}

async function handleBackup(sock, sender, db) {
  try {
    const collections = await db.listCollections().toArray();
    const backup = {};

    for (const col of collections) {
      backup[col.name] = await db.collection(col.name).find({}).toArray();
    }

    await sock.sendMessage(sender, {
      text: `✅ Backup created with ${collections.length} collections`,
      document: Buffer.from(JSON.stringify(backup, null, 2)),
      mimetype: 'application/json',
      fileName: `backup_${Date.now()}.json`
    });
  } catch (error) {
    await sock.sendMessage(sender, {
      text: `❌ Backup failed: ${error.message}`
    });
  }
}

async function handleStats(sock, sender, db) {
  const collections = await db.listCollections().toArray();
  const stats = [];

  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    stats.push(`• ${col.name}: ${count} documents`);
  }

  await sock.sendMessage(sender, {
    text: `*📊 DATABASE STATS*\n\n${stats.join('\n')}`
  });
}
