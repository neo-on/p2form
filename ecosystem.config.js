module.exports = {
  apps: [
    {
      name: 'p2-form-app',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      node_args: '--require dotenv/config',

      // Logging — essential for debugging on VPS
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Restart controls — prevent crash loops from eating CPU
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
