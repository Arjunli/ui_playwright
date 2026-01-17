import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 滚动操作处理器
 */
export class ScrollActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      // 滚动页面
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else {
      const locator = await this.locatorResolver.resolve(step.locator);
      if (locator) {
        await locator.scrollIntoViewIfNeeded();
      }
    }
  }
}