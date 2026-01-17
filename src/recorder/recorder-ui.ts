import { Page } from '@playwright/test';

/**
 * 录制器 UI 组件
 * 在页面上显示录制控制面板
 */
export class RecorderUI {
  private page: Page;
  private isVisible = false;
  private panelId = 'playwright-recorder-panel';

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 显示录制面板
   */
  async show(): Promise<void> {
    if (this.isVisible) {
      return;
    }

    // 等待页面加载完成（如果页面还在加载）
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {
      // 如果超时，继续执行
    }

    // 读取注入脚本文件
    const fs = await import('fs');
    const path = await import('path');
    const injectScriptPath = path.join(__dirname, 'recorder-ui-inject.js');
    
    try {
      const injectScript = fs.readFileSync(injectScriptPath, 'utf-8');
      // 使用 addScriptTag 注入脚本
      await this.page.addScriptTag({ content: injectScript });
      console.log('✅ UI 脚本已注入');
    } catch (error) {
      console.error('❌ 读取注入脚本失败:', error);
      throw error;
    }

    // 等待一下确保脚本执行完成
    if (!this.page.isClosed()) {
      await this.page.waitForTimeout(500);
    }

    // 确保面板显示并可见
    if (!this.page.isClosed()) {
      try {
        await this.page.evaluate(() => {
          const panel = document.getElementById('playwright-recorder-panel');
          if (panel) {
            panel.classList.remove('hidden');
            panel.style.display = 'flex';
            panel.style.visibility = 'visible';
            panel.style.opacity = '1';
            // 强制显示在最上层
            panel.style.zIndex = '2147483647';
            console.log('✅ 录制面板已显示');
          } else {
            console.error('❌ 录制面板创建失败！');
          }
        });

        // 再次检查面板是否存在
        const panelExists = await this.page.evaluate(() => {
          const panel = document.getElementById('playwright-recorder-panel');
          return !!panel;
        });

        if (!panelExists) {
          console.warn('⚠️ 警告：录制面板可能未正确创建，尝试重新创建...');
          // 等待一下再试
          if (!this.page.isClosed()) {
            await this.page.waitForTimeout(1000);
            try {
              const retryExists = await this.page.evaluate(() => {
                return !!document.getElementById('playwright-recorder-panel');
              });
              if (!retryExists) {
                console.error('❌ 录制面板仍然不存在！请检查浏览器控制台');
              }
            } catch (error: any) {
              if (error.message && !error.message.includes('closed')) {
                throw error;
              }
            }
          }
        } else {
          console.log('✅ 录制面板已成功创建并显示');
        }
      } catch (error: any) {
        // 如果页面在 evaluate 过程中关闭，忽略错误
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }

    this.isVisible = true;
  }

  /**
   * 添加操作到 UI
   */
  async addAction(action: { type: string; details: string; timestamp: number }): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    try {
      await this.page.evaluate((action) => {
        const win = window as any;
        if (win.__addRecorderAction) {
          win.__addRecorderAction(action);
        }
      }, action);
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，忽略错误
      if (error.message && error.message.includes('closed')) {
        return;
      }
      throw error;
    }
  }

  /**
   * 获取所有操作
   */
  async getActions(): Promise<any[]> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return [];
    }
    
    try {
      return await this.page.evaluate(() => {
        const win = window as any;
        return win.__recorderActions || [];
      });
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，返回空数组
      if (error.message && error.message.includes('closed')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * 清空操作
   */
  async clearActions(): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    try {
      await this.page.evaluate(() => {
        const win = window as any;
        if (win.__clearRecorderActions) {
          win.__clearRecorderActions();
        }
      });
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，忽略错误
      if (error.message && error.message.includes('closed')) {
        return;
      }
      throw error;
    }
  }

  /**
   * 检查是否暂停
   */
  async isPaused(): Promise<boolean> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return false; // 如果页面已关闭，返回 false，允许继续执行
    }
    
    try {
      return await this.page.evaluate(() => {
        const win = window as any;
        return win.__recorderPaused || false;
      });
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，返回 false
      if (error.message && error.message.includes('closed')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 隐藏面板
   */
  async hide(): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      this.isVisible = false;
      return;
    }
    
    try {
      await this.page.evaluate(() => {
        const panel = document.getElementById('playwright-recorder-panel');
        if (panel) {
          panel.classList.add('hidden');
        }
      });
      this.isVisible = false;
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，忽略错误
      if (error.message && error.message.includes('closed')) {
        this.isVisible = false;
        return;
      }
      throw error;
    }
  }

  /**
   * 显示面板
   */
  async showPanel(): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    try {
      await this.page.evaluate(() => {
        const panel = document.getElementById('playwright-recorder-panel');
        if (panel) {
          panel.classList.remove('hidden');
        }
      });
      this.isVisible = true;
    } catch (error: any) {
      // 如果页面在 evaluate 过程中关闭，忽略错误
      if (error.message && error.message.includes('closed')) {
        return;
      }
      throw error;
    }
  }
}
