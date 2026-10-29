// pm2 config. Build first (`pnpm build`), then `pm2 start ecosystem.config.js`.
module.exports = {
  apps: [
    {
      name: "jira-worklog",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
      },
    },
  ],
};
