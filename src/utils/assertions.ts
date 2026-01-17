import { Page, Locator, expect } from '@playwright/test';
import { allure } from 'allure-playwright';

/**
 * 自定义断言工具
 */
export class CustomAssertions {
  constructor(private page: Page) {}

  /**
   * 软断言 - 收集所有失败但不立即抛出
   */
  async softAssert(condition: () => Promise<boolean>, message: string): Promise<boolean> {
    try {
      const result = await condition();
      if (!result) {
        await allure.attachment('软断言失败', message, 'text/plain');
      }
      return result;
    } catch (error) {
      await allure.attachment('软断言错误', String(error), 'text/plain');
      return false;
    }
  }

  /**
   * 断言元素存在
   */
  async assertExists(locator: Locator, message?: string): Promise<void> {
    await allure.step(message || '断言元素存在', async () => {
      await expect(locator).toBeVisible({ timeout: 5000 });
    });
  }

  /**
   * 断言元素不存在
   */
  async assertNotExists(locator: Locator, message?: string): Promise<void> {
    await allure.step(message || '断言元素不存在', async () => {
      await expect(locator).not.toBeVisible({ timeout: 5000 });
    });
  }

  /**
   * 断言文本包含
   */
  async assertTextContains(locator: Locator, expectedText: string, message?: string): Promise<void> {
    await allure.step(message || `断言文本包含: ${expectedText}`, async () => {
      const text = await locator.textContent();
      expect(text).toContain(expectedText);
    });
  }

  /**
   * 断言 URL 包含
   */
  async assertUrlContains(expectedUrl: string, message?: string): Promise<void> {
    await allure.step(message || `断言 URL 包含: ${expectedUrl}`, async () => {
      const url = this.page.url();
      expect(url).toContain(expectedUrl);
    });
  }

  /**
   * 断言标题包含
   */
  async assertTitleContains(expectedTitle: string, message?: string): Promise<void> {
    await allure.step(message || `断言标题包含: ${expectedTitle}`, async () => {
      const title = await this.page.title();
      expect(title).toContain(expectedTitle);
    });
  }

  /**
   * 断言元素数量
   */
  async assertCount(locator: Locator, expectedCount: number, message?: string): Promise<void> {
    await allure.step(message || `断言元素数量: ${expectedCount}`, async () => {
      await expect(locator).toHaveCount(expectedCount);
    });
  }

  /**
   * 断言属性值
   */
  async assertAttribute(
    locator: Locator,
    attribute: string,
    expectedValue: string,
    message?: string
  ): Promise<void> {
    await allure.step(message || `断言属性 ${attribute} = ${expectedValue}`, async () => {
      await expect(locator).toHaveAttribute(attribute, expectedValue);
    });
  }

  /**
   * 断言元素可见且启用
   */
  async assertEnabled(locator: Locator, message?: string): Promise<void> {
    await allure.step(message || '断言元素启用', async () => {
      await expect(locator).toBeVisible();
      await expect(locator).toBeEnabled();
    });
  }

  /**
   * 断言元素禁用
   */
  async assertDisabled(locator: Locator, message?: string): Promise<void> {
    await allure.step(message || '断言元素禁用', async () => {
      await expect(locator).toBeDisabled();
    });
  }

  /**
   * 带截图的断言
   */
  async assertWithScreenshot<T>(
    assertion: () => Promise<T>,
    screenshotName: string
  ): Promise<T> {
    try {
      return await assertion();
    } catch (error) {
      // 失败时截图
      const screenshot = await this.page.screenshot();
      await allure.attachment(screenshotName, screenshot, 'image/png');
      throw error;
    }
  }
}
