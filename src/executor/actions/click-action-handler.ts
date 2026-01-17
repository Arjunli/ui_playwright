import { Locator } from '@playwright/test';
import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';
import { PageStabilityService } from '../services/page-stability-service';
import { DialogHandler } from '../services/dialog-handler';
import { MenuClickHandler } from './click/menu-click-handler';
import { DialogClickHandler } from './click/dialog-click-handler';

/**
 * 点击操作处理器
 * 处理各种复杂的点击场景：菜单项、对话框、普通点击等
 */
export class ClickActionHandler extends BaseActionHandler {
  private currentStepIndex: number = 0;
  private menuClickHandler: MenuClickHandler;
  private dialogClickHandler: DialogClickHandler;
  
  constructor(
    page: any, 
    private pageStabilityService?: PageStabilityService,
    private dialogHandler?: DialogHandler,
    currentStepIndex?: number
  ) {
    super(page);
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

    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      console.log('⚠️ 页面已关闭，跳过此点击步骤');
      return;
    }

    // 关闭可能存在的对话框
    if (this.dialogHandler) {
      await this.dialogHandler.closeDialogIfExists();
    }

    // 检查是否是菜单项或对话框关闭按钮
    const isMenuItem = this.menuClickHandler.isMenuItem(step);
    const isDialogCloseButton = this.dialogClickHandler.isDialogCloseButton(step);

    // 如果是对话框关闭按钮，先检查对话框是否存在
    if (isDialogCloseButton && !this.page.isClosed()) {
      const dialogExists = await this.dialogClickHandler.checkDialogExists();
      if (!dialogExists) {
        console.log('⚠️ 对话框不存在，跳过对话框关闭按钮点击步骤');
        return;
      }
    }

    // 菜单项处理
    if (isMenuItem) {
      // 等待菜单项可见
      await this.prepareMenuItem(step);

      // 先尝试正常定位器
      let locator: Locator | null = null;
      let useMenuItemSpecialLogic = false;

      try {
        locator = await this.locatorResolver.resolve(step.locator);
        if (locator) {
          const isVisible = await locator.isVisible().catch(() => false);
          if (!isVisible) {
            useMenuItemSpecialLogic = true;
            console.log(`${stepPrefix}⚠️ 菜单项不可见，将使用菜单项特殊处理逻辑`);
          }
        } else {
          useMenuItemSpecialLogic = true;
        }
      } catch (error: any) {
        useMenuItemSpecialLogic = true;
        console.log(`${stepPrefix}⚠️ 定位器解析失败: ${error.message}，将使用菜单项特殊处理逻辑`);
      }

      // 如果正常定位器成功，先尝试正常点击
      if (locator && !useMenuItemSpecialLogic) {
        try {
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await locator.click({ timeout: 10000, force: true });
          console.log(`${stepPrefix}✅ 使用配置的定位策略点击成功`);
          
          // 等待页面稳定
          if (this.pageStabilityService) {
            await this.pageStabilityService.waitForPageStable(4000);
          }
          
          // 处理预期对话框
          await this.handleExpectedDialog(step, stepPrefix);
          return;
        } catch (error: any) {
          console.log(`${stepPrefix}⚠️ 配置的定位策略点击失败: ${error.message}，将使用菜单项特殊处理逻辑`);
          useMenuItemSpecialLogic = true;
        }
      }

      // 使用菜单项特殊处理逻辑
      if (useMenuItemSpecialLogic) {
        const success = await this.menuClickHandler.clickMenuItem(step, stepPrefix);
        if (success) {
          // 等待页面稳定
          if (this.pageStabilityService) {
            await this.pageStabilityService.waitForPageStable(4000);
          }
          
          // 处理预期对话框
          await this.handleExpectedDialog(step, stepPrefix);
          return;
        }
      }
    }

    // 对话框处理
    const isDialog = step.locator.strategies?.some(s => 
      (s.type === 'role' && s.value === 'dialog') ||
      (s.type === 'css' && (s.value.includes('el-overlay-dialog') || s.value.includes('el-overlay-message-box')))
    );

    if (isDialog && !isDialogCloseButton) {
      await this.dialogClickHandler.waitForDialog(step);
    }

    // 普通点击处理
    await this.handleNormalClick(step, stepPrefix, isMenuItem);

    // 等待页面稳定
    if (this.pageStabilityService) {
      await this.pageStabilityService.waitForPageStable(4000);
    }

    // 处理预期对话框
    await this.handleExpectedDialog(step, stepPrefix);

    // 如果点击的是对话框中的"确定"按钮，等待对话框消失
    const clickedText = step.locator?.strategies?.find(s => s.type === 'text' && (s.value === '确定' || s.value === '确 定'));
    if (clickedText) {
      await this.dialogClickHandler.waitForDialogClose();
    }
  }

  /**
   * 准备菜单项（等待菜单展开等）
   */
  private async prepareMenuItem(step: TestStep): Promise<void> {
    try {
      await this.page.waitForSelector(
        'li.el-sub-menu.is-opened, .el-menu--horizontal .el-sub-menu.is-opened, .el-menu--vertical .el-sub-menu.is-opened',
        { timeout: 2000, state: 'visible' }
      ).catch(() => {});

      await this.page.waitForTimeout(500);

      const menuItemText = step.locator?.strategies?.find(s => s.type === 'text')?.value;
      if (menuItemText) {
        try {
          const menuItemLocator = this.page.getByText(menuItemText, { exact: true });
          await menuItemLocator.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
          try {
            const partialLocator = this.page.getByText(menuItemText);
            await partialLocator.waitFor({ state: 'visible', timeout: 3000 });
          } catch {
            // 忽略错误
          }
        }
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 处理普通点击
   */
  private async handleNormalClick(step: TestStep, stepPrefix: string, isMenuItem: boolean): Promise<void> {
    let locator: Locator | null = null;
    
    if (!isMenuItem) {
      locator = await this.locatorResolver.resolve(step.locator);
      if (!locator) {
        console.log('⚠️ 无法解析定位器，跳过此点击步骤');
        return;
      }
    } else {
      // 菜单项已经处理过了
      return;
    }

    if (!locator) {
      return;
    }

    // 等待元素可见
    const visibilityTimeout = step.locator.strategies?.some(s => 
      (s.type === 'role' && s.value === 'dialog') ||
      (s.type === 'css' && s.value.includes('el-overlay-dialog'))
    ) ? 15000 : 10000;

    let elementVisible = false;

    try {
      await locator.waitFor({ state: 'visible', timeout: visibilityTimeout });
      elementVisible = true;
    } catch {
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        await locator.waitFor({ state: 'visible', timeout: 3000 });
        elementVisible = true;
      } catch {
        // 如果仍然不可见，使用 force
      }
    }

    if (elementVisible && locator) {
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
      } catch {
        // 忽略滚动错误
      }
    }

    // 执行点击
    const causesNavigation = (step as any).data?.expectedNavigation || 
                             (step as any).data?.navigationOccurred;

    const clickOptions = {
      ...step.options,
      timeout: 10000,
      force: isMenuItem ? true : !elementVisible
    };

    try {
      if (causesNavigation) {
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
      if (clickError.message && clickError.message.includes('Element is not visible')) {
        // 尝试 JavaScript 点击
        const jsSuccess = await this.tryJavaScriptClick(step);
        if (!jsSuccess) {
          throw clickError;
        }
      } else if (clickError.message && clickError.message.includes('页面已关闭')) {
        // 检查是否是对话框关闭按钮
        const isDialogCloseButton = this.dialogClickHandler.isDialogCloseButton(step);
        if (isDialogCloseButton) {
          console.log('✅ 对话框关闭按钮已成功点击，对话框已关闭');
          return;
        }
        throw clickError;
      } else {
        throw clickError;
      }
    }
  }

  /**
   * 处理预期对话框
   */
  private async handleExpectedDialog(step: TestStep, stepPrefix: string): Promise<void> {
    const isDialogCloseButton = this.dialogClickHandler.isDialogCloseButton(step);
    if ((step as any).expectedDialog && !isDialogCloseButton) {
      if (this.page.isClosed()) {
        return;
      }
      await this.dialogClickHandler.handleExpectedDialog(step, stepPrefix);
    }
  }

  /**
   * 尝试 JavaScript 点击（兜底方案）
   */
  private async tryJavaScriptClick(step: TestStep): Promise<boolean> {
    try {
      const selector = step.locator?.strategies?.[0]?.value || '';
      const jsSuccess = await this.page.evaluate((sel: string) => {
        let element: HTMLElement | null = document.querySelector(sel) as HTMLElement;
        
        if (!element && sel.startsWith('/')) {
          const xpathResult = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          element = xpathResult.singleNodeValue as HTMLElement;
        }
        
        if (element) {
          if (typeof element.click === 'function') {
            element.click();
            return true;
          }
          
          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          element.dispatchEvent(clickEvent);
          return true;
        }
        return false;
      }, selector);

      if (jsSuccess) {
        await this.page.waitForTimeout(300);
        return true;
      }
    } catch {
      // 忽略错误
    }
    return false;
  }
}