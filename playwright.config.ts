import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

// 加载环境变量
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
    // 暂时禁用 Allure 报告生成（避免生成大量日志文件）
    // 如需启用，取消下面的注释
    // ['allure-playwright', { outputFolder: 'reports/allure-results' }],
    ['list']
  ],
  use: {
    baseURL: process.env[`WEB_${ENV.toUpperCase()}_URL`] || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 60000, // 增加到60秒
    navigationTimeout: 60000, // 增加到60秒
  },
  
  // 增加全局测试超时时间（5分钟）
  timeout: 300000,

  projects: [
    // Web 项目 - Chromium
    {
      name: 'chromium-web',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    // Web 项目 - Firefox
    {
      name: 'firefox-web',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    // Web 项目 - WebKit
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
    // 桌面应用（需要单独配置）
    {
      name: 'desktop-app',
      use: {
        baseURL: undefined,
      },
    },
  ],

  // 桌面应用配置
  webServer: undefined, // 可以根据需要配置本地服务器
});
