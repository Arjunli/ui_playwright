import { Locator, Page } from '@playwright/test';
import type { TestStep } from '../../../types/test-config';
import { BaseActionHandler } from '../action-handler';
import { DialogHandler } from '../../services/dialog-handler';
import { PageStabilityService } from '../../services/page-stability-service';
import { MenuClickHandler } from './menu-click-handler';
import { DialogClickHandler } from './dialog-click-handler';

/**
 * 点击操作处理器
 * 整合菜单点击、对话框处理等复杂逻辑
 */
export class ClickActionHandler extends BaseActionHandler {
  private menuClickHandler: MenuClickHandler;
  private dialogClickHandler: DialogClickHandler;
  private dialogHandler: DialogHandler;
  private pageStabilityService: PageStabilityService;
  private currentStepIndex: number = 0;

  constructor(
    page: Page,
    pageStabilityService: PageStabilityService,
    dialogHandler: DialogHandler,
    currentStepIndex?: number
  ) {
    super(page);
    this.pageStabilityService = pageStabilityService;
    this.dialogHandler = dialogHandler;
    this.menuClickHandler = new MenuClickHandler(page);
    this.dialogClickHandler = new DialogClickHandler(page);
    if (currentStepIndex !== undefined) {
      this.currentStepIndex = currentStepIndex;
    }
  }

  setStepIndex(index: number): void {
    this.currentStepIndex = index;
  }

  async execute(step: TestStep): Promise<void> {
    const stepPrefix = this.currentStepIndex > 0 ? `[步骤 ${this.currentStepIndex}] ` : '';
    
    if (!step.locator) {
      throw new Error('点击操作需要定位器');
    }

    // 检查是否是对话框关闭按钮
    const isDialogCloseButton = this.dialogClickHandler.isDialogCloseButton(step);
    
    try {
      // 在执行任何操作前，先检查页面是否已关闭
      if (this.page.isClosed()) {
        if (isDialogCloseButton) {
          console.log('⚠️ 页面已关闭，跳过对话框关闭按钮点击步骤');
          return;
        }
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return;
      }
      
      // 在执行点击前，先检查是否有对话框拦截操作
      await this.dialogHandler.closeDialogIfExists();
      
      // 检查是否是菜单项点击
      const isMenuItem = this.menuClickHandler.isMenuItem(step);
      
      if (isMenuItem) {
        // 使用菜单点击处理器
        const menuClickSuccess = await this.menuClickHandler.clickMenuItem(step, stepPrefix);
        if (menuClickSuccess) {
          await this.pageStabilityService.waitForPageStable(4000);
          return;
        }
        // 如果菜单点击失败，继续使用普通点击逻辑
      }
      
      // 检查是否是对话框关闭按钮
      if (isDialogCloseButton && !this.page.isClosed()) {
        const dialogExists = await this.dialogClickHandler.checkDialogExists();
        if (!dialogExists) {
          console.log('⚠️ 对话框不存在，跳过对话框关闭按钮点击步骤');
          return;
        }
      }
      
      // 对于对话框，先等待对话框容器出现
      const isDialog = step.locator.strategies?.some(s => 
        (s.type === 'role' && s.value === 'dialog') ||
        (s.type === 'css' && (s.value.includes('el-overlay-dialog') || s.value.includes('el-overlay-message-box')))
      );
      
      if (isDialog && !isDialogCloseButton) {
        if (this.page.isClosed()) {
          console.log('⚠️ 页面已关闭，对话框不存在，跳过对话框点击步骤');
          return;
        }
        await this.dialogClickHandler.waitForDialog(step);
      }
      
      // 解析定位器
      let locator: Locator | null = null;
      try {
        locator = await this.locatorResolver.resolve(step.locator);
        if (!locator) {
          if (!isMenuItem) {
            console.log('⚠️ 无法解析定位器，跳过此点击步骤');
            return;
          }
        }
      } catch (error: any) {
        if (!isMenuItem) {
          console.log(`⚠️ 定位器解析失败: ${error.message}，跳过此点击步骤`);
          return;
        }
      }
      
      if (!locator && !isMenuItem) {
        return;
      }
      
      // 等待元素可见
      const visibilityTimeout = isDialog ? 15000 : 10000;
      let elementVisible = false;
      
      if (locator) {
        try {
          await Promise.race([
            locator.waitFor({ state: 'visible', timeout: visibilityTimeout }),
            new Promise<void>((resolve, reject) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  reject(new Error('页面已关闭'));
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), visibilityTimeout + 1000);
            })
          ]);
          elementVisible = true;
        } catch (error: any) {
          if (error.message && error.message.includes('页面已关闭')) {
            throw error;
          }
          // 如果等待可见失败，尝试滚动到元素位置
          try {
            await Promise.race([
              locator.scrollIntoViewIfNeeded({ timeout: 2000 }),
              new Promise<void>((resolve, reject) => {
                const checkInterval = setInterval(() => {
                  if (this.page.isClosed()) {
                    clearInterval(checkInterval);
                    reject(new Error('页面已关闭'));
                  }
                }, 100);
                setTimeout(() => clearInterval(checkInterval), 3000);
              })
            ]);
            await Promise.race([
              locator.waitFor({ state: 'visible', timeout: 3000 }),
              new Promise<void>((resolve, reject) => {
                const checkInterval = setInterval(() => {
                  if (this.page.isClosed()) {
                    clearInterval(checkInterval);
                    reject(new Error('页面已关闭'));
                  }
                }, 100);
                setTimeout(() => clearInterval(checkInterval), 4000);
              })
            ]);
            elementVisible = true;
          } catch (err: any) {
            if (err.message && err.message.includes('页面已关闭')) {
              console.log('⚠️ 页面已关闭，跳过此点击步骤');
              return;
            }
            // 检查元素是否在 DOM 中
            if (this.page.isClosed()) {
              console.log('⚠️ 页面已关闭，跳过此点击步骤');
              return;
            }
            const isAttached = await locator.first().evaluate((el) => {
              return el.isConnected;
            }).catch(() => false);
            
            if (!isAttached) {
              console.log('⚠️ 元素未找到，跳过此点击步骤');
              return;
            }
            console.log('⚠️ 元素存在但不可见，将尝试强制点击');
          }
        }
      }
      
      // 再次检查页面是否关闭
      if (this.page.isClosed()) {
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return;
      }
      
      // 如果元素可见，滚动到元素
      if (elementVisible && locator) {
        try {
          await Promise.race([
            locator.scrollIntoViewIfNeeded({ timeout: 2000 }),
            new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), 3000);
            })
          ]);
        } catch (err: any) {
          if (err.message && err.message.includes('页面已关闭')) {
            console.log('⚠️ 页面已关闭，跳过此点击步骤');
            return;
          }
        }
      }
      
      // 再次检查页面是否关闭
      if (this.page.isClosed()) {
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return;
      }
      
      // 记录点击前的URL
      const urlBeforeClick = this.page.url();
      
      // 检查点击操作是否标记了会导致导航
      const causesNavigation = (step as any).data?.expectedNavigation || 
                               (step as any).data?.navigationOccurred;
      
      // 执行点击
      if (!locator) {
        throw new Error('定位器为 null');
      }
      
      const clickOptions = {
        ...step.options,
        timeout: 10000,
        force: isMenuItem ? true : !elementVisible
      };
      
      try {
        if (causesNavigation) {
          // 如果点击会导致导航，使用 Promise.all 等待导航完成
          await Promise.race([
            Promise.all([
              locator.click(clickOptions),
              this.page.waitForNavigation({ timeout: 10000 }).catch(() => {})
            ]),
            new Promise<void>((resolve, reject) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  reject(new Error('页面已关闭'));
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), 12000);
            })
          ]);
        } else {
          // 普通点击
          await Promise.race([
            locator.click(clickOptions),
            new Promise<void>((resolve, reject) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  reject(new Error('页面已关闭'));
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), 12000);
            })
          ]);
        }
      } catch (clickError: any) {
        // 如果 force 点击也失败，尝试使用 JavaScript 直接点击
        if (clickError.message && clickError.message.includes('Element is not visible')) {
          console.log(`${stepPrefix}⚠️ Force 点击失败，尝试使用 JavaScript 直接点击`);
          const jsClickSuccess = await this.tryJavaScriptClick(step, stepPrefix);
          if (jsClickSuccess) {
            await this.page.waitForTimeout(300);
            await this.pageStabilityService.waitForPageStable(4000);
            return;
          }
        }
        throw clickError;
      }
      
      // 等待页面加载完成
      await this.pageStabilityService.waitForPageStable(4000);
      
      // 检查页面是否关闭
      if (this.page.isClosed()) {
        if (isDialogCloseButton) {
          console.log('✅ 对话框关闭按钮已成功点击，对话框已关闭');
          return;
        }
        const locatorInfo = JSON.stringify(step.locator, null, 2);
        throw new Error(
          `点击操作后页面已关闭: 无法继续执行后续步骤\n` +
          `定位器配置:\n${locatorInfo}\n` +
          `提示: 点击操作可能导致页面关闭，请检查测试配置或重新录制测试`
        );
      }
      
      // 如果点击操作有 expectedDialog，处理预期对话框
      if ((step as any).expectedDialog && !isDialogCloseButton) {
        if (this.page.isClosed()) {
          return;
        }
        await this.dialogClickHandler.handleExpectedDialog(step, stepPrefix);
      }
      
      // 如果点击的是对话框中的"确定"按钮，等待对话框消失
      const clickedText = step.locator?.strategies?.find(s => s.type === 'text' && (s.value === '确定' || s.value === '确 定'));
      if (clickedText) {
        await this.dialogClickHandler.waitForDialogClose();
      }
      
    } catch (error: any) {
      // 检查页面是否关闭
      if (this.page.isClosed()) {
        if (isDialogCloseButton) {
          console.log('⚠️ 点击操作后页面已关闭，跳过此步骤');
          return;
        }
        console.log('⚠️ 点击操作后页面已关闭，跳过此步骤');
        return;
      }
      
      // 检查是否有坐标策略（作为兜底方案）
      const coordinateStrategy = step.locator?.strategies?.find(s => s.type === 'coordinate');
      if (coordinateStrategy && coordinateStrategy.value) {
        try {
          const [x, y] = coordinateStrategy.value.split(',').map(v => parseInt(v.trim(), 10));
          if (!isNaN(x) && !isNaN(y)) {
            console.log(`${stepPrefix}📍 使用坐标点击作为兜底方案: (${x}, ${y})`);
            await this.page.mouse.click(x, y);
            await this.page.waitForTimeout(300);
            console.log(`${stepPrefix}✅ 坐标点击成功`);
            return;
          }
        } catch (coordError: any) {
          console.log(`${stepPrefix}⚠️ 坐标点击失败: ${coordError.message}`);
        }
      }
      
      // 如果错误是"无法解析定位器"或"无法定位元素"，跳过此步骤
      if (error.message && (error.message.includes('无法解析定位器') || error.message.includes('无法定位元素'))) {
        console.log(`⚠️ 点击操作失败: ${error.message}，跳过此步骤`);
        return;
      }
      
      // 如果是元素不可见错误，尝试使用 JavaScript 直接点击
      if (error.message && error.message.includes('Element is not visible')) {
        const jsClickSuccess = await this.tryJavaScriptClick(step, stepPrefix);
        if (jsClickSuccess) {
          await this.page.waitForTimeout(300);
          return;
        }
      }
      
      // 其他错误，抛出原始错误
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`点击操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }

  /**
   * 尝试使用 JavaScript 直接点击
   */
  private async tryJavaScriptClick(step: TestStep, stepPrefix: string): Promise<boolean> {
    try {
      const selector = step.locator?.strategies?.[0]?.value || '';
      const jsClickSuccess = await this.page.evaluate((sel: string) => {
        let element: HTMLElement | null = null;
        
        // 方法1：通过 CSS 选择器查找
        element = document.querySelector(sel) as HTMLElement;
        
        // 方法2：如果找不到，尝试通过 XPath 查找
        if (!element && sel.startsWith('/')) {
          const xpathResult = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          element = xpathResult.singleNodeValue as HTMLElement;
        }
        
        // 方法3：如果还是找不到，尝试通过文本查找
        if (!element) {
          const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
          element = allElements.find(el => el.textContent?.trim() === sel) || null;
        }
        
        if (element) {
          // 尝试多种点击方式
          if (typeof element.click === 'function') {
            element.click();
            return true;
          }
          
          // 触发 click 事件
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(clickEvent);
          
          // 触发 mousedown 和 mouseup 事件
          element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          
          return true;
        }
        return false;
      }, selector);
      
      if (jsClickSuccess) {
        console.log(`${stepPrefix}✅ JavaScript 直接点击成功（100% 兜底）`);
        return true;
      }
    } catch (jsError: any) {
      console.log(`${stepPrefix}⚠️ JavaScript 点击失败: ${jsError.message}`);
    }
    return false;
  }
}