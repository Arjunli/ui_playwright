import { Page } from '@playwright/test';

/**
 * 对话框处理服务
 * 负责检测和关闭对话框，避免拦截后续操作
 */
export class DialogHandler {
  private _page: Page;

  constructor(page: Page) {
    this._page = page;
  }

  /**
   * 更新页面对象
   */
  updatePage(newPage: Page): void {
    this._page = newPage;
  }

  /**
   * 关闭对话框（如果存在）
   * 使用多种方式尝试关闭对话框，避免拦截后续操作
   */
  async closeDialogIfExists(): Promise<void> {
    // 如果页面已关闭，直接返回，避免阻塞
    if (this._page.isClosed()) {
      return;
    }
    
    try {
      const dialogLocator = this._page.locator('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]');
      const dialogCount = await dialogLocator.count();
      
      if (dialogCount > 0) {
        // 检查对话框是否可见
        const visibleDialog = dialogLocator.first();
        const isVisible = await visibleDialog.isVisible().catch(() => false);
        
        if (isVisible) {
          console.log('⚠️ 检测到对话框拦截操作，尝试关闭对话框');
          
          // 尝试多种方式关闭对话框（按优先级）：
          // 1. 尝试点击关闭按钮（X按钮）
          try {
            const closeXButton = this._page.locator(
              'button.el-dialog__close, button.el-message-box__close, ' +
              '[aria-label="Close"], [aria-label="关闭"], ' +
              '.el-dialog__headerbtn, .el-message-box__headerbtn'
            ).first();
            const closeXCount = await closeXButton.count();
            if (closeXCount > 0) {
              await closeXButton.click({ timeout: 2000 });
              await this._page.waitForTimeout(500);
              const stillVisible = await visibleDialog.isVisible().catch(() => false);
              if (!stillVisible) {
                console.log('✅ 通过关闭按钮（X）成功关闭对话框');
                return;
              }
            }
          } catch (closeXError: any) {
            console.log(`⚠️ 关闭按钮（X）失败: ${closeXError.message}，尝试其他方式`);
          }
          
          // 2. 尝试点击"关闭"或"取消"按钮
          try {
            const closeButton = this._page.locator(
              'button:has-text("关闭"), button:has-text("关 闭"), button:has-text("取消"), ' +
              'button.el-button:has-text("关闭"), button.el-button:has-text("取消")'
            ).first();
            const closeButtonCount = await closeButton.count();
            if (closeButtonCount > 0) {
              // 使用 force 点击，避免被其他元素拦截
              await closeButton.click({ timeout: 2000, force: true });
              await this._page.waitForTimeout(500);
              const stillVisible = await visibleDialog.isVisible().catch(() => false);
              if (!stillVisible) {
                console.log('✅ 通过关闭按钮成功关闭对话框');
                return;
              }
            }
          } catch (closeButtonError: any) {
            console.log(`⚠️ 关闭按钮失败: ${closeButtonError.message}，尝试其他方式`);
          }
          
          // 3. 尝试点击对话框外部区域（遮罩层）- 最后的手段
          try {
            const overlay = this._page.locator('.el-overlay, .el-overlay-dialog, .el-overlay-message-box');
            const overlayCount = await overlay.count();
            if (overlayCount > 0) {
              // 点击遮罩层的边缘（避免点击到对话框内容）
              const overlayBox = await overlay.first().boundingBox();
              if (overlayBox) {
                // 点击左上角（远离对话框内容）
                await this._page.mouse.click(overlayBox.x + 5, overlayBox.y + 5);
                await this._page.waitForTimeout(500);
                const stillVisible = await visibleDialog.isVisible().catch(() => false);
                if (!stillVisible) {
                  console.log('✅ 通过点击遮罩层成功关闭对话框');
                  return;
                }
              }
            }
          } catch (overlayError: any) {
            console.log(`⚠️ 点击遮罩层失败: ${overlayError.message}`);
          }
          
          // 5. 使用 JavaScript 直接操作 DOM 关闭对话框（最后手段）
          try {
            console.log('⚠️ 尝试使用 JavaScript 直接关闭对话框');
            await this._page.evaluate(() => {
              // 查找所有对话框
              const dialogs = document.querySelectorAll('.el-overlay-dialog, .el-overlay-message-box, [role="dialog"]');
              dialogs.forEach((dialog: any) => {
                // 尝试触发关闭事件
                if (dialog.dispatchEvent) {
                  dialog.dispatchEvent(new Event('close', { bubbles: true, cancelable: true }));
                }
                // 尝试移除对话框
                const parent = dialog.parentElement;
                if (parent && (parent.classList.contains('el-overlay') || parent.classList.contains('el-overlay-message-box'))) {
                  parent.remove();
                } else {
                  dialog.remove();
                }
              });
              
              // 移除遮罩层
              const overlays = document.querySelectorAll('.el-overlay');
              overlays.forEach((overlay: any) => {
                if (overlay.style && overlay.style.display !== 'none') {
                  overlay.remove();
                }
              });
            });
            
            await this._page.waitForTimeout(500);
            const stillVisible = await visibleDialog.isVisible().catch(() => false);
            if (!stillVisible) {
              console.log('✅ 通过 JavaScript 成功关闭对话框');
              return;
            } else {
              console.log('⚠️ JavaScript 关闭对话框失败，对话框仍然存在');
            }
          } catch (jsError: any) {
            console.log(`⚠️ JavaScript 关闭对话框失败: ${jsError.message}`);
          }
          
          // 如果所有方式都失败，抛出错误
          throw new Error('无法关闭对话框，所有关闭方式都失败了。请检查对话框的关闭按钮或尝试点击遮罩层。');
        }
      }
    } catch (dialogCheckError: any) {
      // 如果检查对话框失败，不影响，继续执行点击操作
      console.log(`⚠️ 检查对话框时出错: ${dialogCheckError.message}，继续执行点击操作`);
    }
  }
}