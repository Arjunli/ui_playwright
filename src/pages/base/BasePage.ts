import { Page, Locator, expect } from '@playwright/test';
import { allure } from 'allure-playwright';
import path from 'path';

export class BasePage {
  constructor(protected page: Page) {}

  /**
   * 导航到指定 URL
   */
  async navigate(url: string): Promise<void> {
    await allure.step(`导航到: ${url}`, async () => {
      await this.page.goto(url, { waitUntil: 'networkidle' });
    });
  }

  /**
   * 点击元素
   */
  async click(locator: Locator | string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step(`点击元素`, async () => {
      await loc.click(options);
    });
  }

  /**
   * 填充输入框
   */
  async fill(locator: Locator | string, value: string, options?: { timeout?: number }): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step(`填充输入: ${value}`, async () => {
      await loc.fill(value, options);
    });
  }

  /**
   * 输入文本（逐个字符）
   */
  async type(locator: Locator | string, text: string, options?: { delay?: number }): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step(`输入文本: ${text}`, async () => {
      await loc.type(text, options);
    });
  }

  /**
   * 选择下拉框选项
   */
  async selectOption(locator: Locator | string, value: string | string[]): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step(`选择选项: ${Array.isArray(value) ? value.join(', ') : value}`, async () => {
      await loc.selectOption(value);
    });
  }

  /**
   * 勾选复选框
   */
  async check(locator: Locator | string): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step('勾选复选框', async () => {
      await loc.check();
    });
  }

  /**
   * 取消勾选复选框
   */
  async uncheck(locator: Locator | string): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step('取消勾选复选框', async () => {
      await loc.uncheck();
    });
  }

  /**
   * 悬停
   */
  async hover(locator: Locator | string): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await allure.step('悬停元素', async () => {
      await loc.hover();
    });
  }

  /**
   * 等待元素可见
   */
  async waitForVisible(locator: Locator | string, timeout?: number): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await loc.waitFor({ state: 'visible', timeout });
  }

  /**
   * 等待元素隐藏
   */
  async waitForHidden(locator: Locator | string, timeout?: number): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await loc.waitFor({ state: 'hidden', timeout });
  }

  /**
   * 获取文本内容
   */
  async getText(locator: Locator | string): Promise<string> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    return await loc.textContent() || '';
  }

  /**
   * 获取输入值
   */
  async getValue(locator: Locator | string): Promise<string> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    return await loc.inputValue();
  }

  /**
   * 截图
   */
  async screenshot(name: string, options?: { fullPage?: boolean }): Promise<void> {
    await allure.step(`截图: ${name}`, async () => {
      const screenshot = await this.page.screenshot({
        path: `reports/screenshots/${name}-${Date.now()}.png`,
        fullPage: options?.fullPage,
      });
      await allure.attachment(name, screenshot, 'image/png');
    });
  }

  /**
   * 断言元素可见
   */
  async expectVisible(locator: Locator | string): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await expect(loc).toBeVisible();
  }

  /**
   * 断言文本内容
   */
  async expectText(locator: Locator | string, expectedText: string | RegExp): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await expect(loc).toHaveText(expectedText);
  }

  /**
   * 断言 URL
   */
  async expectUrl(url: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(url);
  }

  /**
   * 断言标题
   */
  async expectTitle(title: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }

  /**
   * 滚动到元素
   */
  async scrollTo(locator: Locator | string): Promise<void> {
    const loc = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await loc.scrollIntoViewIfNeeded();
  }

  /**
   * 等待指定时间
   */
  async wait(timeout: number): Promise<void> {
    await this.page.waitForTimeout(timeout);
  }

  /**
   * 获取页面对象
   */
  getPage(): Page {
    return this.page;
  }
}
