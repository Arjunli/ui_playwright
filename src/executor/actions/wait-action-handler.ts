import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 等待操作处理器
 */
export class WaitActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    const timeout = step.value ? Number(step.value) : 1000;
    await this.page.waitForTimeout(timeout);
  }
}