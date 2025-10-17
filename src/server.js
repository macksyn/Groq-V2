import express from 'express';
import chalk from 'chalk';

const PORT = process.env.PORT || 3000;

export function startServer(state) {
  const app = express();

  app.use(express.json());

  /**
   * Health check endpoint
   */
  app.get('/health', (req, res) => {
    const status = state.healthMonitor
      ? state.healthMonitor.getStatus()
      : { status: 'initializing' };

    res.json(status);
  });

  /**
   * Root endpoint
   */
  app.get('/', (req, res) => {
    res.json({
      name: 'Groq WhatsApp Bot',
      version: '2.0.0',
      status: 'running'
    });
  });

  app.listen(PORT, () => {
    console.log(chalk.green(`🌐 Server running on port ${PORT}`));
    console.log(chalk.blue(`   Health: http://localhost:${PORT}/health`));
  });
}
