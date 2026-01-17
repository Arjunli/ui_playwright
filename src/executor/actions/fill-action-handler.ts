import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 填充操作处理器
 */
export class FillActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('填充操作需要定位器');
    }
    if (step.value === undefined) {
      throw new Error('填充操作需要值');
    }
    
    try {
      const locator = await this.locatorResolver.resolve(step.locator);
      if (!locator) {
        throw new Error('无法解析定位器');
      }
      
      // 等待元素可编辑
      await locator.waitFor({ state: 'visible', timeout: 10000 });
      
      // 滚动到元素（如果需要）
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        // 滚动后等待一小段时间，确保元素稳定
        await this.page.waitForTimeout(200);
      } catch {
        // 滚动失败不影响，继续
      }
      
      // 先点击输入框，确保焦点在正确的输入框上
      // 这对于有多个相同 CSS 选择器的输入框特别重要
      try {
        await locator.click({ timeout: 5000 });
        // 点击后等待一小段时间，确保焦点切换完成
        await this.page.waitForTimeout(100);
      } catch {
        // 点击失败不影响，继续尝试 fill
      }
      
      // 清空输入框（如果需要）
      try {
        await locator.clear({ timeout: 2000 });
      } catch {
        // 清空失败不影响，继续
      }
      
      // 填充值
      await locator.fill(String(step.value), { timeout: 10000 });
      
      // 填充后等待一小段时间，确保值已设置
      await this.page.waitForTimeout(100);
    } catch (error: any) {
      // 提供更详细的错误信息
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`填充操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }
}