import chalk from 'chalk';

const MONITOR_INTERVAL = 300000; // 5 minutes

export class HealthMonitor {
  constructor(socketManager, mongoManager, pluginManager) {
    this.socketManager = socketManager;
    this.mongoManager = mongoManager;
    this.pluginManager = pluginManager;
    this.startTime = Date.now();
    this.interval = null;
  }

  /**
   * Start health monitoring
   */
  start() {
    console.log(chalk.blue('💓 Health monitor started'));
    
    this.interval = setInterval(() => {
      this.logHealth();
    }, MONITOR_INTERVAL);

    // Log immediately
    setTimeout(() => this.logHealth(), 5000);
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      console.log(chalk.yellow('💓 Health monitor stopped'));
    }
  }

  /**
   * Log health metrics
   */
  logHealth() {
    const uptime = this.formatUptime(Date.now() - this.startTime);
    const memory = this.getMemoryUsage();
    const socketStatus = this.socketManager.isConnected() ? '✅ Connected' : '❌ Disconnected';
    const dbStatus = this.mongoManager.isConnected() ? '✅ Connected' : '❌ Disconnected';
    const pluginCount = this.pluginManager.getPluginCount();

    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan.bold('📊 HEALTH REPORT'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`⏱️  Uptime: ${uptime}`));
    console.log(chalk.white(`💾 Memory: ${memory.used} / ${memory.total} (${memory.percentage}%)`));
    console.log(chalk.white(`🔗 Socket: ${socketStatus}`));
    console.log(chalk.white(`🗄️  Database: ${dbStatus}`));
    console.log(chalk.white(`🔌 Plugins: ${pluginCount} loaded`));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const total = process.memoryUsage().heapTotal / 1024 / 1024;
    const percentage = Math.round((used / total) * 100);

    return {
      used: `${Math.round(used)}MB`,
      total: `${Math.round(total)}MB`,
      percentage
    };
  }

  /**
   * Get health status object
   */
  getStatus() {
    return {
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      socketConnected: this.socketManager.isConnected(),
      dbConnected: this.mongoManager.isConnected(),
      pluginCount: this.pluginManager.getPluginCount(),
      timestamp: new Date().toISOString()
    };
  }
}
