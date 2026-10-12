import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3100/api/health', env: { PORT: '3100', AI_API_KEY: '', APP_PASSWORD: '' }, reuseExistingServer: false },
});
