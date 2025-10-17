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
   * Load all plugins from plugins directory
   */
  async loadPlugins() {
    try {
      const files = await fs.readdir(PLUGINS_DIR);
      const jsFiles = files.filter(f => f.endsWith('.js'));

      for (const file of jsFiles) {
        await this.loadPlugin(file);
      }

      console.log(chalk.green(`✅ Loaded ${this.plugins.size} plugins`));
    } catch (error) {
      console.error(chalk.red('❌ Error loading plugins:'), error);
    }
  }

  /**
   * Load individual plugin
   */
  async loadPlugin(filename) {
    try {
      const pluginPath = path.join(PLUGINS_DIR, filename);
      const plugin = await import(`file://${pluginPath}?t=${Date.now()}`);

      if (!plugin.default || !plugin.default.name) {
        console.warn(chalk.yellow(`⚠️  Invalid plugin: ${filename}`));
        return;
      }

      const pluginData = {
        ...plugin.default,
        filename,
        enabled: true,
        crashes: 0,
        lastCrash: null
      };

      this.plugins.set(plugin.default.name, pluginData);
      console.log(chalk.blue(`  ✓ Loaded: ${plugin.default.name}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to load ${filename}:`), error.message);
    }
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

    try {
      const db = this.mongoManager.getDB();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Plugin timeout')), PLUGIN_TIMEOUT)
      );

      await Promise.race([
        plugin.run({ msg, args, sock, db, prefix: this.prefix }),
        timeout
      ]);

    } catch (error) {
      console.error(chalk.red(`❌ Plugin "${plugin.name}" error:`), error);
      
      this.trackCrash(plugin.name);
      
      await sock.sendMessage(sender, {
        text: `❌ Error executing command: ${error.message}`
      });
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

    if (plugin.crashes >= MAX_CRASHES) {
      plugin.enabled = false;
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
   * Enable plugin
   */
  enablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      plugin.crashes = 0;
      return true;
    }
    return false;
  }

  /**
   * Disable plugin
   */
  disablePlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
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
}
