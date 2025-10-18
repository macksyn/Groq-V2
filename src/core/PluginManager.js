// src/core/PluginManager.js - Enhanced with automatic database sync

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { RateLimiter } from '../utils/rateLimiter.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '../../plugins');
const PLUGIN_TIMEOUT = 30000;
const MAX_CRASHES = 3;
const CRASH_WINDOW = 3600000; // 1 hour

export class PluginManager {
  constructor(mongoManager) {
    this.mongoManager = mongoManager;
    this.plugins = new Map();
    this.crashTracker = new Map();
    this.rateLimiter = new RateLimiter();
    this.commandQueue = [];
    this.isProcessing = false;
    this.prefix = process.env.PREFIX || '.';
  }

  /**
   * Load all plugins from plugins directory and sync to database
   */
  async loadPlugins() {
    try {
      console.log(chalk.blue('📦 Loading plugins...'));
      
      const files = await fs.readdir(PLUGINS_DIR);
      const jsFiles = files.filter(f => f.endsWith('.js'));

      console.log(chalk.cyan(`   Found ${jsFiles.length} plugin files`));

      // Load each plugin file
      for (const file of jsFiles) {
        await this.loadPlugin(file);
      }

      // Sync loaded plugins to database
      await this.syncPluginsToDatabase();

      console.log(chalk.green(`✅ Loaded ${this.plugins.size} plugins successfully`));
    } catch (error) {
      console.error(chalk.red('❌ Error loading plugins:'), error);
    }
  }

  /**
   * Load individual plugin from file
   */
  async loadPlugin(filename) {
    try {
      const pluginPath = path.join(PLUGINS_DIR, filename);
      const plugin = await import(`file://${pluginPath}?t=${Date.now()}`);

      if (!plugin.default || !plugin.default.name) {
        console.warn(chalk.yellow(`⚠️  Invalid plugin structure: ${filename}`));
        return;
      }

      const pluginData = {
        ...plugin.default,
        filename,
        enabled: true,
        crashes: 0,
        lastCrash: null,
        loadedAt: new Date()
      };

      this.plugins.set(plugin.default.name, pluginData);
      console.log(chalk.blue(`   ✓ ${plugin.default.name}`));
    } catch (error) {
      console.error(chalk.red(`   ✗ Failed to load ${filename}:`), error.message);
    }
  }

  /**
   * Sync all loaded plugins to MongoDB
   */
  async syncPluginsToDatabase() {
    try {
      const db = this.mongoManager.getDB();
      const pluginsCol = db.collection('plugins');

      console.log(chalk.blue('💾 Syncing plugins to database...'));

      // Get existing plugins from database
      const existingPlugins = await pluginsCol.find({}).toArray();
      const existingMap = new Map(existingPlugins.map(p => [p.name, p]));

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      // Sync each loaded plugin
      for (const [name, plugin] of this.plugins) {
        const existing = existingMap.get(name);

        const pluginDoc = {
          name: plugin.name,
          description: plugin.description || 'No description',
          category: plugin.category || 'general',
          aliases: plugin.aliases || [],
          usage: plugin.usage || '',
          example: plugin.example || '',
          filename: plugin.filename,
          ownerOnly: plugin.ownerOnly || false,
          enabled: existing ? existing.enabled : true, // Preserve enabled state
          crashes: existing ? existing.crashes : 0,
          lastCrash: existing ? existing.lastCrash : null,
          updatedAt: new Date(),
          version: plugin.version || '1.0.0'
        };

        if (!existing) {
          // New plugin - insert
          pluginDoc.createdAt = new Date();
          await pluginsCol.insertOne(pluginDoc);
          added++;
        } else {
          // Existing plugin - update only if changed
          const hasChanges = 
            existing.description !== pluginDoc.description ||
            existing.category !== pluginDoc.category ||
            JSON.stringify(existing.aliases) !== JSON.stringify(pluginDoc.aliases) ||
            existing.usage !== pluginDoc.usage;

          if (hasChanges) {
            await pluginsCol.updateOne(
              { name },
              { $set: pluginDoc }
            );
            updated++;
          } else {
            unchanged++;
          }

          // Update in-memory enabled state from database
          plugin.enabled = existing.enabled;
        }
      }

      // Mark plugins in database that no longer exist in files
      const loadedNames = Array.from(this.plugins.keys());
      const orphanedPlugins = existingPlugins.filter(
        p => !loadedNames.includes(p.name)
      );

      if (orphanedPlugins.length > 0) {
        console.log(chalk.yellow(`   ⚠️  Found ${orphanedPlugins.length} orphaned plugins in database`));
        for (const orphan of orphanedPlugins) {
          await pluginsCol.updateOne(
            { name: orphan.name },
            { $set: { enabled: false, orphaned: true } }
          );
        }
      }

      console.log(chalk.green('   ✅ Database sync complete:'));
      console.log(chalk.cyan(`      • Added: ${added}`));
      console.log(chalk.cyan(`      • Updated: ${updated}`));
      console.log(chalk.cyan(`      • Unchanged: ${unchanged}`));
      if (orphanedPlugins.length > 0) {
        console.log(chalk.yellow(`      • Orphaned: ${orphanedPlugins.length}`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Database sync failed:'), error);
    }
  }

  /**
   * Reload all plugins (useful for hot-reload)
   */
  async reloadPlugins() {
    console.log(chalk.yellow('🔄 Reloading all plugins...'));
    
    // Clear current plugins
    this.plugins.clear();
    
    // Reload from files
    await this.loadPlugins();
    
    console.log(chalk.green('✅ Plugins reloaded'));
  }

  /**
   * Reload a specific plugin
   */
  async reloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }

    console.log(chalk.blue(`🔄 Reloading plugin: ${pluginName}`));
    
    // Remove from memory
    this.plugins.delete(pluginName);
    
    // Reload from file
    await this.loadPlugin(plugin.filename);
    
    // Sync to database
    await this.syncPluginsToDatabase();
    
    console.log(chalk.green(`✅ Plugin "${pluginName}" reloaded`));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(msg, sock) {
    if (!msg.message || msg.key.fromMe) return;

    const text = this.extractMessageText(msg);
    if (!text || !text.startsWith(this.prefix)) return;

    const [commandName, ...args] = text.slice(this.prefix.length).trim().split(/\s+/);
    const sender = msg.key.remoteJid;

    // Rate limiting
    if (!this.rateLimiter.checkLimit(sender)) {
      await sock.sendMessage(sender, {
        text: '⚠️ You are sending commands too fast. Please wait a moment.'
      });
      return;
    }

    // Add to queue
    this.commandQueue.push({ commandName, args, msg, sock, sender });
    this.processQueue();
  }

  /**
   * Process command queue
   */
  async processQueue() {
    if (this.isProcessing || this.commandQueue.length === 0) return;

    this.isProcessing = true;

    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();
      await this.executeCommand(command);
    }

    this.isProcessing = false;
  }

  /**
   * Execute command with timeout and error handling
   */
  async executeCommand({ commandName, args, msg, sock, sender }) {
    const plugin = this.findPlugin(commandName);

    if (!plugin) return;

    if (!plugin.enabled) {
      await sock.sendMessage(sender, {
        text: `⚠️ Plugin "${plugin.name}" is currently disabled.`
      });
      return;
    }

    // Check owner-only commands
    if (plugin.ownerOnly && !this.isOwner(sender)) {
      await sock.sendMessage(sender, {
        text: '❌ This command is only available to the bot owner.'
      });
      return;
    }

    try {
      const db = this.mongoManager.getDB();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Plugin timeout')), PLUGIN_TIMEOUT)
      );

      await Promise.race([
        plugin.run({ msg, args, sock, db, prefix: this.prefix }),
        timeout
      ]);

      // Update usage stats
      await this.updatePluginStats(plugin.name);

    } catch (error) {
      console.error(chalk.red(`❌ Plugin "${plugin.name}" error:`), error);
      
      this.trackCrash(plugin.name);
      
      await sock.sendMessage(sender, {
        text: `❌ Error executing command: ${error.message}`
      });
    }
  }

  /**
   * Update plugin usage statistics
   */
  async updatePluginStats(pluginName) {
    try {
      const db = this.mongoManager.getDB();
      const pluginsCol = db.collection('plugins');

      await pluginsCol.updateOne(
        { name: pluginName },
        { 
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date() }
        }
      );
    } catch (error) {
      // Don't fail command execution if stats update fails
      console.warn(chalk.yellow('⚠️ Failed to update plugin stats'), error.message);
    }
  }

  /**
   * Track plugin crashes
   */
  trackCrash(pluginName) {
    const now = Date.now();
    const plugin = this.plugins.get(pluginName);

    if (!plugin) return;

    // Clean old crash records
    if (plugin.lastCrash && (now - plugin.lastCrash > CRASH_WINDOW)) {
      plugin.crashes = 0;
    }

    plugin.crashes++;
    plugin.lastCrash = now;

    // Update database
    const db = this.mongoManager.getDB();
    db.collection('plugins').updateOne(
      { name: pluginName },
      { 
        $set: { crashes: plugin.crashes, lastCrash: new Date(now) }
      }
    ).catch(err => console.error('Failed to update crash count:', err));

    if (plugin.crashes >= MAX_CRASHES) {
      plugin.enabled = false;
      
      // Disable in database
      db.collection('plugins').updateOne(
        { name: pluginName },
        { $set: { enabled: false } }
      ).catch(err => console.error('Failed to disable plugin:', err));

      console.error(chalk.red(
        `🚫 Plugin "${pluginName}" auto-disabled after ${MAX_CRASHES} crashes`
      ));
    }
  }

  /**
   * Find plugin by name or alias
   */
  findPlugin(name) {
    for (const plugin of this.plugins.values()) {
      if (plugin.name === name || plugin.aliases?.includes(name)) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * Extract text from message
   */
  extractMessageText(msg) {
    return (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    );
  }

  /**
   * Check if user is owner
   */
  isOwner(jid) {
    const ownerNumber = process.env.OWNER_NUMBER;
    return jid.includes(ownerNumber);
  }

  /**
   * Enable plugin
   */
  async enablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      plugin.crashes = 0;
      
      // Update database
      const db = this.mongoManager.getDB();
      await db.collection('plugins').updateOne(
        { name },
        { $set: { enabled: true, crashes: 0 } }
      );
      return true;
    }
    return false;
  }

  /**
   * Disable plugin
   */
  async disablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      
      // Update database
      const db = this.mongoManager.getDB();
      await db.collection('plugins').updateOne(
        { name },
        { $set: { enabled: false } }
      );
      return true;
    }
    return false;
  }

  /**
   * Get all plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin count
   */
  getPluginCount() {
    return this.plugins.size;
  }

  /**
   * Get plugin by name
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }
}