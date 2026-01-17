import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 取消勾选操作处理器
 */
export class UncheckActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('取消勾选操作需要定位器');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.uncheck();
  }
}