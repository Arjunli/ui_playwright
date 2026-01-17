import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

// 创建空的 allure 对象，避免修改所有调用处
const allure = {
  attachment: async (_name: string, _content: any, _type?: string) => {},
};

/**
 * 截图操作处理器
 */
export class ScreenshotActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    const name = step.value ? String(step.value) : `screenshot-${Date.now()}`;
    const screenshot = await this.page.screenshot({
      path: `reports/screenshots/${name}.png`,
      fullPage: step.options?.fullPage,
    });
    await allure.attachment(name, screenshot, 'image/png');
  }
}