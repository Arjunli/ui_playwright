import { Page } from '@playwright/test';
import type { TestStep } from '../../types/test-config';
import { LocatorResolver } from '../locator-resolver';

/**
 * 操作处理器接口
 */
export interface IActionHandler {
  /**
   * 执行操作
   */
  execute(step: TestStep): Promise<void>;
}

/**
 * 操作处理器基类
 * 提供通用的功能，如定位器解析、页面访问等
 */
export abstract class BaseActionHandler implements IActionHandler {
  protected locatorResolver: LocatorResolver;
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
    this.locatorResolver = new LocatorResolver(page);
  }

  /**
   * 执行操作（抽象方法，由子类实现）
   */
  abstract execute(step: TestStep): Promise<void>;

  /**
   * 更新页面对象
   */
  updatePage(newPage: Page): void {
    this.page = newPage;
    this.locatorResolver = new LocatorResolver(newPage);
  }
}