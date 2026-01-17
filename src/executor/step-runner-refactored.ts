import { Page } from '@playwright/test';
import type { TestStep } from '../types/test-config';
import { LocatorResolver } from './locator-resolver';
import { PageStabilityService } from './services/page-stability-service';
import { DialogHandler } from './services/dialog-handler';

// 操作处理器
import { NavigateActionHandler } from './actions/navigate-action-handler';
import { FillActionHandler } from './actions/fill-action-handler';
import { SelectActionHandler } from './actions/select-action-handler';
import { CheckActionHandler } from './actions/check-action-handler';
import { UncheckActionHandler } from './actions/uncheck-action-handler';
import { HoverActionHandler } from './actions/hover-action-handler';
import { PressActionHandler } from './actions/press-action-handler';
import { WaitActionHandler } from './actions/wait-action-handler';
import { ScreenshotActionHandler } from './actions/screenshot-action-handler';
import { ScrollActionHandler } from './actions/scroll-action-handler';
import { UploadActionHandler } from './actions/upload-action-handler';
import { ClickActionHandler } from './actions/click-action-handler';
import type { IActionHandler } from './actions/action-handler';

// 创建空的 allure 对象，避免修改所有调用处
const allure = {
  step: async (_name: string, fn: () => Promise<void>) => await fn(),
  attachment: async (_name: string, _content: any, _type?: string) => {},
};

/**
 * 步骤运行器（重构后）
 * 执行单个测试步骤
 */
export class StepRunner {
  private locatorResolver: LocatorResolver;
  private currentStepIndex: number = 0;
  private currentStepDescription: string = '';
  private _page: Page;
  
  // 服务层
  private pageStabilityService: PageStabilityService;
  private dialogHandler: DialogHandler;
  
  // 操作处理器映射
  private actionHandlers: Map<string, IActionHandler> = new Map();

  constructor(page: Page) {
    this._page = page;
    this.locatorResolver = new LocatorResolver(page);
    this.pageStabilityService = new PageStabilityService(page);
    this.dialogHandler = new DialogHandler(page);
    
    // 初始化操作处理器
    this.initializeActionHandlers();
  }

  /**
   * 初始化操作处理器
   */
  private initializeActionHandlers(): void {
    // 创建各个操作处理器实例
    this.actionHandlers.set('navigate', new NavigateActionHandler(this._page));
    this.actionHandlers.set('click', new ClickActionHandler(this._page, this.pageStabilityService, this.dialogHandler, this.currentStepIndex));
    this.actionHandlers.set('fill', new FillActionHandler(this._page));
    this.actionHandlers.set('select', new SelectActionHandler(this._page));
    this.actionHandlers.set('check', new CheckActionHandler(this._page));
    this.actionHandlers.set('uncheck', new UncheckActionHandler(this._page));
    this.actionHandlers.set('hover', new HoverActionHandler(this._page, this.pageStabilityService, this.currentStepIndex));
    this.actionHandlers.set('press', new PressActionHandler(this._page, this.pageStabilityService));
    this.actionHandlers.set('wait', new WaitActionHandler(this._page));
    this.actionHandlers.set('screenshot', new ScreenshotActionHandler(this._page));
    this.actionHandlers.set('scroll', new ScrollActionHandler(this._page));
    this.actionHandlers.set('upload', new UploadActionHandler(this._page));
  }

  /**
   * 获取当前页面对象
   */
  get page(): Page {
    return this._page;
  }

  /**
   * 更新页面对象
   */
  updatePage(newPage: Page): void {
    this._page = newPage;
    this.locatorResolver = new LocatorResolver(newPage);
    this.pageStabilityService.updatePage(newPage);
    this.dialogHandler.updatePage(newPage);
    
    // 重新初始化所有处理器（更新页面对象）
    this.initializeActionHandlers();
  }

  /**
   * 执行测试步骤
   * @param step 测试步骤
   * @param index 步骤索引（可选）
   * @param description 步骤描述（可选）
   */
  async run(step: TestStep, index?: number, description?: string): Promise<void> {
    // 更新步骤索引和描述
    if (index !== undefined) {
      this.currentStepIndex = index;
    }
    if (description) {
      this.currentStepDescription = description;
    }
    
    // 更新 hover 处理器的步骤索引
    const hoverHandler = this.actionHandlers.get('hover') as HoverActionHandler;
    if (hoverHandler && typeof hoverHandler.setStepIndex === 'function') {
      hoverHandler.setStepIndex(this.currentStepIndex);
    }
    
    const stepName = step.description || step.action;
    await allure.step(stepName, async () => {
      try {
        // 在执行操作前，先等待页面稳定
        await this.pageStabilityService.waitForPageStable(5000);
        
        // 根据操作类型选择处理器
        const handler = this.actionHandlers.get(step.action);
        
        // 更新点击和悬停处理器的步骤索引
        if (step.action === 'click') {
          const clickHandler = handler as ClickActionHandler;
          if (clickHandler && typeof clickHandler.setStepIndex === 'function') {
            clickHandler.setStepIndex(this.currentStepIndex);
          }
        }
        
        if (step.action === 'assert') {
          // 断言逻辑在 config-executor 中处理
          // 这里可以添加通用断言逻辑
        } else if (step.action === 'drag') {
          // 拖拽操作暂未实现
          throw new Error('拖拽操作暂未实现');
        } else if (handler) {
          // 使用对应的处理器执行操作
          await handler.execute(step);
        } else {
          throw new Error(`不支持的操作: ${step.action}`);
        }

        // 等待条件
        if (step.waitFor) {
          await this.handleWaitFor(step.waitFor);
        }
        
        // 操作完成后，再次等待页面稳定
        if (step.action !== 'navigate' && step.action !== 'wait') {
          await this.pageStabilityService.waitForPageStable(2000);
        }
      } catch (error) {
        // 尝试附加截图到 Allure（如果页面仍然打开）
        try {
          if (!this.page.isClosed()) {
            const screenshot = await this.page.screenshot();
            await allure.attachment('错误截图', screenshot, 'image/png');
          }
        } catch (screenshotError) {
          // 如果截图失败，忽略错误
          console.warn('无法截取错误截图:', screenshotError);
        }
        throw error;
      }
    });
  }

  /**
   * 处理等待条件
   */
  private async handleWaitFor(waitFor: NonNullable<TestStep['waitFor']>): Promise<void> {
    if (waitFor.selector) {
      const state = waitFor.state || 'visible';
      const timeout = waitFor.timeout || 10000;
      await this.page.waitForSelector(waitFor.selector, { state, timeout });
    }
  }
}