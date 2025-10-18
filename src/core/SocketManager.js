import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import { Boom } from '@hapi/boom';
import logger from '../utils/logger.js';

const MAX_RETRIES = 8;
const BASE_DELAY = 1000;

export class SocketManager {
  constructor(sessionManager, pluginManager, mongoManager) {
    this.sessionManager = sessionManager;
    this.pluginManager = pluginManager;
    this.mongoManager = mongoManager;
    this.sock = null;
    this.retryCount = 0;
    this.isConnecting = false;
    this.listeners = new Map();
  }

  /**
   * Connect to WhatsApp
   */
  async connect() {
    if (this.isConnecting) {
      console.log(chalk.yellow('⚠️  Connection already in progress...'));
      return;
    }

    this.isConnecting = true;

    try {
      const { state, saveCreds } = await this.sessionManager.getAuthState();
      const { version } = await fetchLatestBaileysVersion();

      console.log(chalk.cyan(`📱 Using WhatsApp version: ${version.join('.')}`));

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: true,
        browser: ['Groq Bot', 'Chrome', '1.0.0'],
        logger: logger,
        getMessage: async (key) => {
          return { conversation: '' };
        },
        syncFullHistory: false,
        markOnlineOnConnect: true,
        maxMsgRetryCount: 3,
        retryRequestDelayMs: 500,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',
      });

      // Remove old listeners
      this.removeAllListeners();

      // Setup event listeners
      this.setupConnectionListener();
      this.setupCredentialsListener(saveCreds);
      this.setupMessageListener();

      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error(chalk.red('❌ Connection error:'), error);
      await this.handleReconnect();
    }
  }

  /**
   * Setup connection update listener
   */
  setupConnectionListener() {
    const listener = async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(chalk.yellow('\n📱 Scan QR Code:\n'));
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'connecting') {
        console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
      }

      if (connection === 'open') {
        console.log(chalk.green('✅ WhatsApp connection established'));
        console.log(chalk.cyan(`📱 Connected as: ${this.sock.user?.name || 'Unknown'}`));
        this.retryCount = 0;
        
        // Send startup notification to owner after a delay
        setTimeout(() => {
          this.sendStartupNotification();
        }, 3000);
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        console.log(chalk.red(`❌ Connection closed. Reason: ${reason}`));

        if (shouldReconnect) {
          await this.handleReconnect();
        } else {
          console.log(chalk.red('⚠️  Logged out. Please delete session and restart.'));
          await this.sessionManager.cleanSession();
          process.exit(0);
        }
      }
    };

    this.sock.ev.on('connection.update', listener);
    this.listeners.set('connection.update', listener);
  }

  /**
   * Setup credentials update listener
   */
  setupCredentialsListener(saveCreds) {
    const listener = saveCreds;
    this.sock.ev.on('creds.update', listener);
    this.listeners.set('creds.update', listener);
  }

  /**
   * Setup message listener - CRITICAL FOR RECEIVING MESSAGES
   */
  setupMessageListener() {
    const listener = async (update) => {
      try {
        const { messages, type } = update;

        if (!messages || messages.length === 0) {
          console.log(chalk.gray('ℹ️ Empty message update'));
          return;
        }

        console.log(chalk.yellow(`\n📨 Received ${messages.length} message(s) (type: ${type})`));

        for (const msg of messages) {
          try {
            // Skip if from self (own messages)
            if (msg.key?.fromMe) {
              console.log(chalk.gray('ℹ️ Skipping own message'));
              continue;
            }

            const sender = msg.key?.remoteJid;
            if (!sender) {
              console.log(chalk.gray('ℹ️ No sender info, skipping'));
              continue;
            }

            // Extract message text
            const text = this.extractMessageText(msg);

            if (!text || text.trim().length === 0) {
              console.log(chalk.gray(`ℹ️ Empty message from ${sender}`));
              continue;
            }

            console.log(chalk.green(`✅ Message from ${sender}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`));

            // Pass to plugin manager for command handling
            await this.pluginManager.handleMessage(msg, this.sock);

          } catch (msgError) {
            console.error(chalk.red('❌ Error processing individual message:'), msgError.message);
          }
        }

      } catch (error) {
        console.error(chalk.red('❌ Message listener error:'), error.message);
      }
    };

    this.sock.ev.on('messages.upsert', listener);
    this.listeners.set('messages.upsert', listener);
  }

  /**
   * Extract message text from various message types
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
   * Send startup notification to owner
   */
  async sendStartupNotification() {
    try {
      const ownerNumber = process.env.OWNER_NUMBER;
      if (!ownerNumber) {
        console.log(chalk.yellow('⚠️ No OWNER_NUMBER set, skipping startup notification'));
        return;
      }

      const jid = ownerNumber + '@s.whatsapp.net';
      const botName = process.env.BOT_NAME || 'Groq Bot';

      const message = `🤖 *${botName} is now online!*

✅ Status: Running
🔌 Connection: Established
⏰ Time: ${new Date().toLocaleString()}

Type *.help* for commands.`;

      await this.sock.sendMessage(jid, { text: message });
      console.log(chalk.green('📤 Startup notification sent to owner'));

    } catch (error) {
      console.warn(chalk.yellow('⚠️ Startup notification failed:'), error.message);
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    if (!this.sock) return;

    for (const [event, listener] of this.listeners) {
      try {
        this.sock.ev.off(event, listener);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Could not remove listener for ${event}:`), error.message);
      }
    }
    this.listeners.clear();
  }

  /**
   * Handle reconnection with exponential backoff
   */
  async handleReconnect() {
    if (this.retryCount >= MAX_RETRIES) {
      console.error(chalk.red(`❌ Max retries (${MAX_RETRIES}) reached. Giving up.`));
      process.exit(1);
    }

    this.retryCount++;
    const delay = Math.min(BASE_DELAY * Math.pow(2, this.retryCount), 30000);

    console.log(chalk.yellow(
      `🔄 Reconnecting in ${delay / 1000}s... (Attempt ${this.retryCount}/${MAX_RETRIES})`
    ));

    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect() {
    if (this.sock) {
      this.removeAllListeners();
      await this.sock.end();
      this.sock = null;
    }
  }

  /**
   * Get socket instance
   */
  getSocket() {
    return this.sock;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.sock && this.sock.user;
  }
}