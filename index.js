import './src/utils/logger.js';
import { SessionManager } from './src/core/SessionManager.js';
import { SocketManager } from './src/core/SocketManager.js';
import { MongoManager } from './src/core/MongoManager.js';
import { PluginManager } from './src/core/PluginManager.js';
import { HealthMonitor } from './src/core/HealthMonitor.js';
import { startServer } from './src/server.js';
import { config } from 'dotenv';
import chalk from 'chalk';

config();

/**
 * Global state management
 */
const state = {
  sessionManager: null,
  socketManager: null,
  mongoManager: null,
  pluginManager: null,
  healthMonitor: null,
  isShuttingDown: false
};

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal = 'UNKNOWN') {
  if (state.isShuttingDown) return;
  state.isShuttingDown = true;

  console.log(chalk.yellow(`\n🛑 Received ${signal}. Starting graceful shutdown...`));

  try {
    // Stop health monitoring
    if (state.healthMonitor) {
      state.healthMonitor.stop();
    }

    // Close socket connection
    if (state.socketManager) {
      await state.socketManager.disconnect();
    }

    // Close MongoDB connection
    if (state.mongoManager) {
      await state.mongoManager.close();
    }

    console.log(chalk.green('✅ Graceful shutdown completed'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('❌ Error during shutdown:'), error);
    process.exit(1);
  }
}

/**
 * Initialize all bot components
 */
async function initializeBot() {
  try {
    console.log(chalk.cyan.bold('\n🚀 Starting Groq AI Framework...\n'));

    // Initialize MongoDB
    console.log(chalk.blue('📦 Connecting to MongoDB...'));
    state.mongoManager = new MongoManager();
    await state.mongoManager.connect();
    console.log(chalk.green('✅ MongoDB connected\n'));

    // Initialize Session Manager - PASS PROCESS.ENV HERE
    console.log(chalk.blue('🔐 Initializing Session Manager...'));
    state.sessionManager = new SessionManager(process.env);
    await state.sessionManager.initialize();
    console.log(chalk.green('✅ Session initialized\n'));

    // Initialize Plugin Manager
    console.log(chalk.blue('🔌 Loading plugins...'));
    state.pluginManager = new PluginManager(state.mongoManager);
    await state.pluginManager.loadPlugins();
    console.log(chalk.green(`✅ Loaded ${state.pluginManager.getPluginCount()} plugins\n`));

    // Initialize Socket Manager
    console.log(chalk.blue('🔗 Connecting to WhatsApp...'));
    state.socketManager = new SocketManager(
      state.sessionManager,
      state.pluginManager,
      state.mongoManager
    );
    await state.socketManager.connect();
    console.log(chalk.green('✅ WhatsApp connected\n'));

    // Start Health Monitor
    state.healthMonitor = new HealthMonitor(
      state.socketManager,
      state.mongoManager,
      state.pluginManager
    );
    state.healthMonitor.start();

    // Start Express server
    startServer(state);

    console.log(chalk.green.bold('\n✨ Groq is now running!\n'));
  } catch (error) {
    console.error(chalk.red('❌ Fatal error during initialization:'), error);
    await gracefulShutdown('INIT_ERROR');
  }
}

/**
 * Global error handlers
 */
process.on('uncaughtException', async (error) => {
  console.error(chalk.red('💥 Uncaught Exception:'), error);
  await gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(chalk.red('💥 Unhandled Rejection at:'), promise, 'reason:', reason);
  await gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the bot
initializeBot();