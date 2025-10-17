import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import { Boom } from '@hapi/boom';

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

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        browser: ['Groq Bot', 'Chrome', '1.0.0'],
        getMessage: async (key) => {
          return { conversation: '' };
        }
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
      } else if (connection === 'open') {
        console.log(chalk.green('✅ WhatsApp connection established'));
        this.retryCount = 0;
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
   * Setup message listener
   */
  setupMessageListener() {
    const listener = async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          await this.pluginManager.handleMessage(msg, this.sock);
        } catch (error) {
          console.error(chalk.red('❌ Error handling message:'), error);
        }
      }
    };

    this.sock.ev.on('messages.upsert', listener);
    this.listeners.set('messages.upsert', listener);
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    if (!this.sock) return;

    for (const [event, listener] of this.listeners) {
      this.sock.ev.off(event, listener);
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
