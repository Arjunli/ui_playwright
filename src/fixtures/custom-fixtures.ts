import { test as base, Page, BrowserContext } from '@playwright/test';
import { BasePage } from '../pages/base/BasePage';
import { getEnvironment } from '../config/environments';
import type { Platform } from '../types';

type CustomFixtures = {
  webPage: BasePage;
  mobilePage: BasePage;
  desktopPage: BasePage;
  basePage: BasePage;
  environment: ReturnType<typeof getEnvironment>;
};

export const test = base.extend<CustomFixtures>({
  environment: async ({}, use) => {
    const env = getEnvironment();
    await use(env);
  },

  basePage: async ({ page }, use) => {
    const basePage = new BasePage(page);
    await use(basePage);
  },

  webPage: async ({ page, environment }, use) => {
    const basePage = new BasePage(page);
    // 设置 Web 环境的基础 URL
    if (environment.webUrl) {
      await page.goto(environment.webUrl);
    }
    await use(basePage);
  },

  mobilePage: async ({ page, environment }, use) => {
    const basePage = new BasePage(page);
    // 设置移动端环境的基础 URL
    if (environment.mobileUrl) {
      await page.goto(environment.mobileUrl);
    }
    await use(basePage);
  },

  desktopPage: async ({ page }, use) => {
    const basePage = new BasePage(page);
    // 桌面应用可能需要特殊处理
    await use(basePage);
  },
});

export { expect } from '@playwright/test';
