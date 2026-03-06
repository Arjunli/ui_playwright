import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

// 加载环境变量（包含 Midscene AI 模型配置）
config({ path: path.resolve(__dirname, '.env') });

const ENV = process.env.ENV || 'dev';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
    ['list'],
    // Midscene AI 可视化报告
    ['@midscene/web/playwright-reporter', { type: 'merged' }],
  ],

  use: {
    baseURL: process.env[`WEB_${ENV.toUpperCase()}_URL`] || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 60000,
    navigationTimeout: 60000,
  },

  // AI 推理需要较长时间，设置 5 分钟超时
  timeout: 300000,

  projects: [
    // Web - Chromium
    {
      name: 'chromium-web',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    // Web - Firefox
    {
      name: 'firefox-web',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    // Web - WebKit
    {
      name: 'webkit-web',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    // 移动端 - iPhone
    {
      name: 'mobile-iphone',
      use: {
        ...devices['iPhone 13 Pro'],
      },
    },
    // 移动端 - Android
    {
      name: 'mobile-android',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
});
