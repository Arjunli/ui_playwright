import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';
import type { PageStabilityService } from '../services/page-stability-service';

/**
 * 按键操作处理器
 */
export class PressActionHandler extends BaseActionHandler {
  constructor(page: any, private pageStabilityService?: PageStabilityService) {
    super(page);
  }

  async execute(step: TestStep): Promise<void> {
    if (!step.value || typeof step.value !== 'string') {
      throw new Error('按键操作需要键名');
    }
    
    try {
      // 如果按键操作有定位器，先定位到该元素并聚焦（确保按键在正确的元素上执行）
      if (step.locator && step.locator.strategies && step.locator.strategies.length > 0) {
        const locator = await this.locatorResolver.resolve(step.locator);
        
        if (locator) {
          // 等待元素可见
          await locator.waitFor({ state: 'visible', timeout: 10000 });
          
          // 滚动到视图中
          try {
            await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
          } catch {
            // 滚动失败不影响，继续
          }
          
          // 聚焦到元素（对于输入框很重要）
          try {
            await locator.focus({ timeout: 5000 });
            // 等待一小段时间，确保聚焦完成
            await this.page.waitForTimeout(200);
          } catch (error) {
            // 如果聚焦失败，尝试点击元素（某些元素需要点击才能聚焦）
            try {
              await locator.click({ timeout: 5000 });
              await this.page.waitForTimeout(200);
            } catch {
              // 如果都失败，继续执行（可能元素已经聚焦）
              console.warn('⚠️ 无法聚焦到元素，继续执行按键操作');
            }
          }
        }
      }
      
      // 检查按键操作是否标记了会导致导航（特别是 Enter 键）
      const causesNavigation = (step as any).data?.expectedNavigation || 
                               (step as any).data?.navigationOccurred ||
                               step.targetUrl; // 如果有targetUrl，也认为会导致导航
      
      if (causesNavigation && step.value === 'Enter') {
        // 如果按键会导致导航，使用 Promise.all 等待导航完成
        // 参考 DeploySentinel Recorder 的最佳实践
        await Promise.all([
          this.page.keyboard.press(step.value),
          this.page.waitForNavigation({ timeout: 10000 }).catch(() => {
            // 如果导航超时，继续执行
          })
        ]);
      } else {
        await this.page.keyboard.press(step.value);
      }
      
      // 等待页面加载完成（如果按键导致导航）
      if (causesNavigation) {
        if (this.pageStabilityService) {
          await this.pageStabilityService.waitForPageStable(4000);
        }
      } else {
        // 即使没有导航，也等待页面稳定（可能触发了其他异步操作）
        if (this.pageStabilityService) {
          await this.pageStabilityService.waitForPageStable(2000);
        }
      }
    } catch (error: any) {
      // 抛出原始错误
      throw new Error(`按键操作失败: ${error.message}\n按键: ${step.value}`);
    }
  }
}