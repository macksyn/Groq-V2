export default {
  apps: [{
    name: 'Groq AI',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 4000,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
