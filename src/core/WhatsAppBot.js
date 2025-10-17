import { EventEmitter } from 'events';
import chalk from 'chalk';
import moment from 'moment-timezone';
import { SocketManager } from './SocketManager.js';
import { WebServer } from './WebServer.js';
import { SessionManager } from './SessionManager.js';
import { HealthMonitor } from './HealthMonitor.js';

export class WhatsAppBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.status = 'initializing';
    this.startTime = Date.now();
    
    // Core components
    this.sessionManager = null;
    this.socketManager = null;
    this.webServer = null;
    this.healthMonitor = null;
    
    this.bioUpdateCount = 0;
    this.lastSuccessfulConnection = Date.now();
  }

  async start() {
    try {
      console.log(chalk.blue('🚀 Starting WhatsApp Bot...'));
      
      // Step 1: Initialize session management
      await this.initializeSessionManager();
      
      // Step 2: Start web server
      await this.startWebServer();
      
      // Step 3: Connect to WhatsApp
      await this.connectWhatsApp();
      
      // Step 4: Start monitoring
      await this.startMonitoring();
      
      this.status = 'running';
      console.log(chalk.green('🎉 Bot started successfully!'));
      this.emit('started');
      
    } catch (error) {
      this.status = 'error';
      console.error(chalk.red('❌ Bot startup failed:'), error.message);
      throw error;
    }
  }

  async restart() {
    try {
      await this.stop();
      await this.start();
    } catch (error) {
      console.error(chalk.red('❌ Bot restart failed:'), error.message);
      process.exit(1);
    }
  }

  async stop() {
    try {
      console.log(chalk.yellow('🛑 Stopping bot...'));
      this.status = 'stopping';
      
      if (this.healthMonitor) await this.healthMonitor.stop();
      if (this.socketManager) await this.socketManager.disconnect();
      if (this.webServer) await this.webServer.stop();
      
      this.status = 'stopped';
      console.log(chalk.green('✅ Bot stopped'));
      this.emit('stopped');
      
    } catch (error) {
      console.error(chalk.red('❌ Bot stop failed:'), error.message);
      throw error;
    }
  }

  async initializeSessionManager() {
    console.log(chalk.blue('📁 Initializing session management...'));
    this.sessionManager = new SessionManager(this.config);
    await this.sessionManager.initialize();
  }

  async startWebServer() {
    console.log(chalk.blue('🌐 Starting web server...'));
    this.webServer = new WebServer(this.config, this);
    await this.webServer.start();
  }

  async connectWhatsApp() {
    console.log(chalk.blue('📱 Connecting to WhatsApp...'));
    this.socketManager = new SocketManager(this.config, this.sessionManager);
    
    // Handle incoming messages
    this.socketManager.on('message', async (data) => {
      try {
        await this.handleMessage(data);
      } catch (error) {
        console.error(chalk.red('❌ Message handler error:'), error.message);
      }
    });
    
    // Handle calls
    this.socketManager.on('call', async (data) => {
      try {
        await this.handleCall(data);
      } catch (error) {
        console.error(chalk.red('❌ Call handler error:'), error.message);
      }
    });
    
    // Handle connection status changes
    this.socketManager.on('statusChange', (status) => {
      this.handleStatusChange(status);
    });
    
    await this.socketManager.connect();
  }

  async handleMessage({ messageUpdate, socket }) {
    const messages = messageUpdate.messages || [];
    
    for (const msg of messages) {
      if (msg.key.fromMe) continue; // Skip own messages
      
      const sender = msg.key.remoteJid;
      const text = this.extractMessageText(msg);
      
      if (!text) continue;
      
      // Auto-read if enabled
      if (this.config.AUTO_READ) {
        try {
          await socket.readMessages([msg.key]);
        } catch (error) {
          console.warn(chalk.yellow('⚠️ Auto-read failed:'), error.message);
        }
      }
      
      // Auto-react if enabled
      if (this.config.AUTO_REACT && Math.random() > 0.7) {
        const reactions = ['😂', '❤️', '👍', '🔥', '😍'];
        try {
          await socket.sendMessage(sender, {
            react: {
              text: reactions[Math.floor(Math.random() * reactions.length)],
              key: msg.key
            }
          });
        } catch (error) {
          console.warn(chalk.yellow('⚠️ Auto-react failed:'), error.message);
        }
      }
      
      // Handle commands (if message starts with prefix)
      if (text.startsWith(this.config.PREFIX)) {
        await this.handleCommand(text, msg, socket);
      }
      
      console.log(chalk.cyan(`💬 From ${sender}: ${text.substring(0, 50)}...`));
    }
  }

  async handleCommand(text, msg, socket) {
    const parts = text.slice(this.config.PREFIX.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    const sender = msg.key.remoteJid;
    
    try {
      switch (command) {
        case 'ping':
          await socket.sendMessage(sender, { text: '🏓 Pong!' });
          break;
          
        case 'menu':
          const menu = this.buildMenu();
          await socket.sendMessage(sender, { text: menu });
          break;
          
        case 'stats':
          const stats = this.buildStats();
          await socket.sendMessage(sender, { text: stats });
          break;
          
        case 'alive':
          await socket.sendMessage(sender, { 
            text: `🤖 ${this.config.BOT_NAME} is alive and running! ✅` 
          });
          break;
          
        default:
          // Unknown command - do nothing or send help
          break;
      }
    } catch (error) {
      console.error(chalk.red('❌ Command error:'), error.message);
      try {
        await socket.sendMessage(sender, { 
          text: `❌ Command failed: ${error.message}` 
        });
      } catch (err) {
        console.warn(chalk.yellow('⚠️ Failed to send error message'));
      }
    }
  }

  async handleCall({ callUpdate, socket }) {
    if (!this.config.REJECT_CALL) return;
    
    const call = callUpdate[0];
    if (!call) return;
    
    try {
      await socket.rejectCall(call.id, call.from);
      console.log(chalk.yellow(`📞 Rejected call from ${call.from}`));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Call rejection failed:'), error.message);
    }
  }

  async startMonitoring() {
    this.healthMonitor = new HealthMonitor(this, this.config);
    await this.healthMonitor.start();
    
    // Auto bio updates
    if (this.config.AUTO_BIO) {
      this.startBioUpdates();
    }
  }

  startBioUpdates() {
    setInterval(async () => {
      try {
        if (this.bioUpdateCount >= 3) return;
        
        const socket = this.socketManager?.getSocket();
        if (!socket || !socket.user?.id) return;
        
        const time = moment().tz(this.config.TIMEZONE).format('HH:mm:ss');
        const date = moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY');
        
        const bioText = `🤖 ${this.config.BOT_NAME}
⏰ ${time} | 📅 ${date}
✅ Online`;

        // Bio update might not be supported in newer Baileys
        // await socket.updateProfileStatus(bioText);
        
        this.bioUpdateCount++;
        console.log(chalk.cyan(`📝 Bio: ${bioText.replace(/\n/g, ' | ')}`));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Bio update failed:'), error.message);
      }
    }, 20 * 60 * 1000);
    
    setInterval(() => {
      this.bioUpdateCount = 0;
    }, 60 * 60 * 1000);
  }

  handleStatusChange(status) {
    this.status = status;
    this.emit('statusChange', status);
    
    console.log(chalk.cyan(`📡 Bot status: ${status}`));
    
    if (status === 'connected') {
      this.lastSuccessfulConnection = Date.now();
      this.sendStartupNotification();
    }
  }

  async sendStartupNotification() {
    try {
      if (!this.config.OWNER_NUMBER) return;
      
      const socket = this.socketManager?.getSocket();
      if (!socket || !socket.user?.id) return;
      
      setTimeout(async () => {
        try {
          const message = this.buildStartupMessage();
          await socket.sendMessage(this.config.OWNER_NUMBER + '@s.whatsapp.net', { 
            text: message 
          });
          console.log(chalk.green('📤 Startup notification sent'));
        } catch (error) {
          console.log(chalk.yellow('⚠️ Startup notification failed:'), error.message);
        }
      }, 5000);
      
    } catch (error) {
      console.log(chalk.yellow('⚠️ Startup notification error:'), error.message);
    }
  }

  buildMenu() {
    return `╔════════════════════════════╗
║  🤖 ${this.config.BOT_NAME} - MENU
╚════════════════════════════╝

📋 *Available Commands:*

${this.config.PREFIX}ping - Check if bot is alive
${this.config.PREFIX}menu - Show this menu
${this.config.PREFIX}stats - Show bot statistics
${this.config.PREFIX}alive - Bot status

💡 Mode: ${this.config.MODE.toUpperCase()}
⚙️ Prefix: ${this.config.PREFIX}

Made with ❤️`;
  }

  buildStats() {
    const uptime = Date.now() - this.startTime;
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    
    const memUsage = process.memoryUsage();
    const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    return `╔════════════════════════════╗
║  📊 BOT STATISTICS
╚════════════════════════════╝

⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
💾 *Memory:* ${heapUsed}MB / ${heapTotal}MB
📱 *Status:* ${this.status.toUpperCase()}
🔌 *Connection:* ${this.socketManager?.isReady() ? '✅ Connected' : '❌ Disconnected'}

⏰ *Current Time:*
${moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}`;
  }

  extractMessageText(msg) {
    return (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    );
  }

  // Getters
  getStatus() { return this.status; }
  getUptime() { return Date.now() - this.startTime; }
  getSocket() { return this.socketManager?.getSocket(); }
  
  getStats() {
    const memUsage = process.memoryUsage();
    return {
      status: this.status,
      uptime: this.getUptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      lastConnection: new Date(this.lastSuccessfulConnection).toISOString()
    };
  }
}