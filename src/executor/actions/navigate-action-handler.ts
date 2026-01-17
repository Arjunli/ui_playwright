import { Page } from '@playwright/test';
import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';

/**
 * 导航操作处理器
 */
export class NavigateActionHandler extends BaseActionHandler {
  async execute(step: TestStep): Promise<void> {
    if (!step.value || typeof step.value !== 'string') {
      throw new Error('导航操作需要 URL');
    }
    
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      console.log('⚠️ 页面已关闭，无法执行导航操作，跳过此步骤');
      return;
    }
    
    // 获取当前 URL，如果相同则跳过
    const currentUrl = this.page.url();
    const targetUrl = step.value;
    
    // 如果当前 URL 和目标 URL 相同，跳过导航
    if (currentUrl === targetUrl || currentUrl.endsWith(targetUrl) || targetUrl.endsWith(currentUrl)) {
      return;
    }
    
    try {
      // 等待页面导航完成
      await this.page.goto(targetUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
    } catch (error: any) {
      // 如果页面在导航过程中关闭，记录警告但不抛出错误
      if (error.message && error.message.includes('closed')) {
        console.log('⚠️ 导航过程中页面已关闭，跳过此步骤');
        return;
      }
      throw error;
    }
    
    // 等待页面稳定
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      // 如果网络空闲超时，继续执行
    });
  }
}