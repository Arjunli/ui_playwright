import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 勾选操作处理器
 */
export class CheckActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('勾选操作需要定位器');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.check();
  }
}