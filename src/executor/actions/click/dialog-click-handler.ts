import { Locator, Page } from '@playwright/test';
import type { TestStep } from '../../../types/test-config';

/**
 * 对话框点击处理器
 * 处理对话框相关的点击操作
 */
export class DialogClickHandler {
  constructor(private page: Page) {}

  /**
   * 判断是否是对话框关闭按钮
   */
  isDialogCloseButton(step: TestStep): boolean {
    return step.locator?.strategies?.some(s => 
      (s.type === 'text' && (s.value === '关闭' || s.value === '关 闭' || s.value === '确定' || s.value === '确认' || s.value === '取消')) ||
      (s.type === 'xpath' && s.value.includes('el-dialog__footer')) ||
      (s.type === 'css' && s.value.includes('el-dialog__footer'))
    ) || false;
  }

  /**
   * 检查对话框是否存在
   */
  async checkDialogExists(): Promise<boolean> {
    try {
      const dialogCount = await this.page.locator('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]').count();
      return dialogCount > 0;
    } catch {
      return false;
    }
  }

  /**
   * 等待对话框出现
   */
  async waitForDialog(step: TestStep): Promise<void> {
    const dialogCssStrategy = step.locator?.strategies?.find(s => 
      s.type === 'css' && (s.value.includes('el-overlay-dialog') || s.value.includes('el-overlay-message-box'))
    );

    if (dialogCssStrategy) {
      try {
        await this.page.waitForSelector(dialogCssStrategy.value, { 
          state: 'visible', 
          timeout: 2000 
        }).catch(() => {});
        await this.page.waitForTimeout(300);
      } catch {
        // 忽略错误
      }
    } else {
      try {
        await this.page.waitForSelector('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]', { 
          state: 'visible', 
          timeout: 2000 
        }).catch(() => {});
        await this.page.waitForTimeout(300);
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 处理预期对话框点击
   */
  async handleExpectedDialog(step: TestStep, stepPrefix: string): Promise<void> {
    const expectedDialogName = (step as any).expectedDialog;
    if (!expectedDialogName) {
      return;
    }

    // 按优先级定位并点击对话框
    const dialogStrategies = [
      { type: 'role', value: 'dialog', priority: 4 },
      { type: 'css', value: 'div.el-overlay-dialog', priority: 7 },
      { type: 'css', value: 'div.el-overlay-message-box', priority: 7 },
    ];

    dialogStrategies.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    for (const strategy of dialogStrategies) {
      try {
        let dialogLocator: Locator;
        
        if (strategy.type === 'role') {
          dialogLocator = expectedDialogName 
            ? this.page.getByRole('dialog', { name: expectedDialogName }).first()
            : this.page.getByRole('dialog').first();
        } else {
          dialogLocator = this.page.locator(strategy.value).first();
        }
        
        await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });
        await dialogLocator.click({ force: true, timeout: 3000 });
        
        console.log(`${stepPrefix}  └─ ✅ 成功通过【${strategy.type}: ${strategy.value}】点击对话框`);
        await this.page.waitForTimeout(500);
        return;
      } catch (error: any) {
        console.log(`${stepPrefix}  └─ ⚠️ 【${strategy.type}: ${strategy.value}】定位/点击失败：${error.message}`);
        continue;
      }
    }

    // JS 兜底方案
    try {
      const jsSuccess = await this.page.evaluate((dialogName: string | null) => {
        let dialog: HTMLElement | null = document.querySelector('div.el-overlay-dialog') as HTMLElement;
        if (!dialog) {
          dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        }
        if (!dialog && dialogName) {
          const allDialogs = Array.from(document.querySelectorAll('[role="dialog"], div.el-overlay-dialog')) as HTMLElement[];
          dialog = allDialogs.find(d => d.textContent?.includes(dialogName)) || null;
        }
        if (dialog) {
          dialog.click();
          return true;
        }
        return false;
      }, expectedDialogName || null);

      if (jsSuccess) {
        console.log(`${stepPrefix}  └─ ✅ JS 兜底方案：成功点击对话框`);
        await this.page.waitForTimeout(500);
      }
    } catch (error: any) {
      console.log(`${stepPrefix}  └─ ❌ 所有定位策略均失败：${error.message}`);
    }
  }

  /**
   * 等待对话框消失
   */
  async waitForDialogClose(): Promise<void> {
    try {
      await this.page.waitForSelector('div.el-overlay-message-box', { 
        state: 'hidden', 
        timeout: 3000 
      }).catch(() => {
        return this.page.waitForFunction(
          () => !document.querySelector('div.el-overlay-message-box'),
          { timeout: 3000 }
        ).catch(() => {});
      });
    } catch {
      // 忽略错误
    }
  }
}