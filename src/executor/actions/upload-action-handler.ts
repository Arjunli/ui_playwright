import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 上传操作处理器
 */
export class UploadActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('上传操作需要定位器');
    }
    if (!step.value || typeof step.value !== 'string') {
      throw new Error('上传操作需要文件路径');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.setInputFiles(step.value);
  }
}