import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 选择操作处理器
 */
export class SelectActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('选择操作需要定位器');
    }
    if (step.value === undefined) {
      throw new Error('选择操作需要值');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    const value = Array.isArray(step.value) ? step.value : [String(step.value)];
    await locator.selectOption(value);
  }
}