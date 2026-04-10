module.exports = {
  apps: [
    {
      name: 'p2-form-app',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      // This tells PM2 to load .env from the current working directory explicitly
      node_args: '--require dotenv/config'
    }
  ]
};
