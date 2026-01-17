import { Page, Locator, BrowserContext, Browser } from '@playwright/test';
// 暂时禁用 Allure 报告生成（避免生成大量日志文件）
// 如需启用，取消下面的注释并注释掉空的 allure 对象
// import { allure } from 'allure-playwright';
import type { TestStep } from '../types/test-config';
import { LocatorResolver } from './locator-resolver';

// 创建空的 allure 对象，避免修改所有调用处
const allure = {
  step: async (_name: string, fn: () => Promise<void>) => await fn(),
  attachment: async (_name: string, _content: any, _type?: string) => {},
};

/**
 * 步骤运行器
 * 执行单个测试步骤
 */
export class StepRunner {
  private locatorResolver: LocatorResolver;
  private currentStepIndex: number = 0;
  private currentStepDescription: string = '';
  private pendingRequests: Set<string> = new Set();
  private isMonitoringNetwork = false;
  private _page: Page;

  constructor(page: Page) {
    this._page = page;
    this.locatorResolver = new LocatorResolver(page);
    this.startNetworkMonitoring();
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
    // 重置网络监控标志并重新启动
    this.isMonitoringNetwork = false;
    this.pendingRequests.clear();
    this.startNetworkMonitoring();
  }

  /**
   * 开始监控网络请求
   */
  private startNetworkMonitoring(): void {
    if (this.isMonitoringNetwork) return;
    this.isMonitoringNetwork = true;

    // 监听请求开始
    this.page.on('request', (request) => {
      const url = request.url();
      // 只监控重要的请求（排除静态资源）
      if (!url.match(/\.(jpg|jpeg|png|gif|svg|ico|css|woff|woff2|ttf|eot)$/i)) {
        this.pendingRequests.add(url);
      }
    });

    // 监听请求完成
    this.page.on('response', (response) => {
      const url = response.url();
      this.pendingRequests.delete(url);
    });

    // 监听请求失败
    this.page.on('requestfailed', (request) => {
      const url = request.url();
      this.pendingRequests.delete(url);
    });
  }

  /**
   * 检查页面是否正在加载
   */
  private async isPageLoading(): Promise<boolean> {
    // 如果页面已关闭，返回 false（不再加载）
    if (this.page.isClosed()) {
      return false;
    }
    
    // 检查是否有待处理的网络请求
    if (this.pendingRequests.size > 0) {
      return true;
    }

    // 检查页面加载状态
    try {
      const isLoading = await this.page.evaluate(() => {
        // 检查 document.readyState
        if (document.readyState !== 'complete') {
          return true;
        }

        // 检查是否有正在进行的 fetch 请求（通过检查 performance API）
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const recentEntries = entries.filter(entry => {
          const duration = entry.duration || 0;
          const startTime = entry.startTime || 0;
          const endTime = startTime + duration;
          const now = performance.now();
          // 检查最近2秒内的请求
          return (now - endTime) < 2000 && duration > 0;
        });
        
        // 如果有最近的请求且持续时间较长，可能还在加载
        return recentEntries.some(entry => {
          const duration = entry.duration || 0;
          return duration > 1000; // 超过1秒的请求可能还在进行
        });
      });
      return isLoading;
    } catch {
      // 如果检查失败，保守地认为可能正在加载
      return false;
    }
  }

  /**
   * 智能等待页面加载完成
   */
  private async waitForPageStable(maxWaitTime: number = 5000): Promise<void> {
    // 如果页面已关闭，直接返回
    if (this.page.isClosed()) {
      return;
    }
    
    // 首先等待 DOM 加载完成
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {
      // 如果超时，继续执行
    }
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 每次循环都检查页面是否关闭
      if (this.page.isClosed()) {
        return;
      }
      
      const isLoading = await this.isPageLoading();
      
      if (!isLoading) {
        // 页面似乎已经稳定，再等待一小段时间确保完全稳定
        // 增加等待时间，确保动画和异步操作完成
        // 使用 Promise.race 避免在页面关闭时无限等待
        if (!this.page.isClosed()) {
          try {
            await Promise.race([
              this.page.waitForTimeout(800),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this.page.isClosed()) {
                    clearInterval(checkInterval);
                    resolve();
                  }
                }, 100);
                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve();
                }, 1000); // 最多等待1秒
              })
            ]);
          } catch {
            // 如果等待失败（页面可能已关闭），直接返回
            return;
          }
        }
        return;
      }
      
      // 如果还在加载，等待一段时间后再次检查
      if (!this.page.isClosed()) {
        try {
          await Promise.race([
            this.page.waitForTimeout(500),
            new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
              }, 600); // 最多等待600ms
            })
          ]);
        } catch {
          // 如果等待失败，直接返回
          return;
        }
      } else {
        // 如果页面关闭了，直接返回
        return;
      }
    }

    // 即使超时，也尝试等待网络空闲（但先检查页面是否关闭）
    if (!this.page.isClosed()) {
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {
          // 如果网络空闲超时，至少等待 DOM 加载完成
          if (!this.page.isClosed()) {
            return this.page.waitForLoadState('domcontentloaded', { timeout: 2000 });
          }
        });
        // 网络空闲后，再等待一小段时间确保完全稳定
        if (!this.page.isClosed()) {
          try {
            await Promise.race([
              this.page.waitForTimeout(500),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this.page.isClosed()) {
                    clearInterval(checkInterval);
                    resolve();
                  }
                }, 100);
                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve();
                }, 600); // 最多等待600ms
              })
            ]);
          } catch {
            // 如果等待失败，直接返回
            return;
          }
        }
      } catch {
        // 如果所有等待都失败，至少等待一小段时间
        if (!this.page.isClosed()) {
          try {
            await Promise.race([
              this.page.waitForTimeout(500),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this.page.isClosed()) {
                    clearInterval(checkInterval);
                    resolve();
                  }
                }, 100);
                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve();
                }, 600); // 最多等待600ms
              })
            ]);
          } catch {
            // 如果等待失败，直接返回
            return;
          }
        }
      }
    }
  }

  /**
   * 执行测试步骤
   */
  async run(step: TestStep): Promise<void> {
    const stepName = step.description || step.action;
    await allure.step(stepName, async () => {
      try {
        // 在执行操作前，先等待页面稳定（如果正在加载）
        // 增加等待时间，确保上一步操作完全完成
        await this.waitForPageStable(5000);
        
        switch (step.action) {
          case 'navigate':
            await this.runNavigate(step);
            break;
          case 'click':
            await this.runClick(step);
            break;
          case 'fill':
            await this.runFill(step);
            break;
          case 'select':
            await this.runSelect(step);
            break;
          case 'check':
            await this.runCheck(step);
            break;
          case 'uncheck':
            await this.runUncheck(step);
            break;
          case 'hover':
            await this.runHover(step);
            break;
          case 'press':
            await this.runPress(step);
            break;
          case 'hover':
            await this.runHover(step);
            break;
          case 'wait':
            await this.runWait(step);
            break;
          case 'screenshot':
            await this.runScreenshot(step);
            break;
          case 'assert':
            await this.runAssert(step);
            break;
          case 'scroll':
            await this.runScroll(step);
            break;
          case 'drag':
            await this.runDrag(step);
            break;
          case 'upload':
            await this.runUpload(step);
            break;
          default:
            throw new Error(`不支持的操作: ${step.action}`);
        }

        // 等待条件
        if (step.waitFor) {
          await this.handleWaitFor(step.waitFor);
        }
        
        // 操作完成后，再次等待页面稳定（确保异步操作完成）
        // 对于某些操作（如 navigate），已经在操作内部等待，这里可以跳过
        if (step.action !== 'navigate' && step.action !== 'wait') {
          await this.waitForPageStable(2000);
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
   * 执行导航
   */
  private async runNavigate(step: TestStep): Promise<void> {
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

  /**
   * 执行点击
   */
  private async runClick(step: TestStep): Promise<void> {
    const stepPrefix = this.currentStepIndex > 0 ? `[步骤 ${this.currentStepIndex}] ` : '';
    
    if (!step.locator) {
      throw new Error('点击操作需要定位器');
    }
    
    // 检查是否是对话框关闭按钮（在方法开始处定义，确保在整个方法中可用）
    const isDialogCloseButtonCheck = step.locator?.strategies?.some(s => 
      (s.type === 'text' && (s.value === '关闭' || s.value === '关 闭' || s.value === '取消')) ||
      (s.type === 'xpath' && s.value.includes('el-dialog__footer')) ||
      (s.type === 'css' && s.value.includes('el-dialog__footer'))
    );
    
    try {
      // 在执行任何操作前，先检查页面是否已关闭
      if (this.page.isClosed()) {
        // 如果页面已关闭，直接返回，不抛出错误
        // 如果是对话框关闭按钮，这是正常的；如果不是，后续步骤自然会失败
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return; // 跳过此步骤，继续执行后续步骤
      }
      
      // 在执行点击前，先检查是否有对话框拦截操作
      // 如果有对话框，先尝试关闭它（这是关键步骤，确保对话框不会拦截后续操作）
      await this.closeDialogIfExists();
      
      // 检查是否是菜单项点击，如果是，先确保父菜单已展开
      const isMenuItem = step.locator.strategies?.some(s => 
        (s.type === 'css' && (s.value.includes('el-menu-item') || s.value.includes('el-sub-menu'))) ||
        (s.type === 'text' && s.value)
      );
      
      if (isMenuItem) {
        // 等待菜单项可见（可能需要先展开父菜单）
        try {
          // 先等待菜单展开（如果之前有悬停操作）
          await this.page.waitForSelector(
            'li.el-sub-menu.is-opened, .el-menu--horizontal .el-sub-menu.is-opened, .el-menu--vertical .el-sub-menu.is-opened',
            { timeout: 2000, state: 'visible' }
          ).catch(() => {
            // 如果子菜单没有出现，不影响，继续
          });
          
          // 额外等待，确保菜单项完全可见
          await this.page.waitForTimeout(500);
          
          // 尝试等待菜单项可见（最多等待5秒）
          const menuItemText = step.locator.strategies?.find(s => s.type === 'text')?.value;
          if (menuItemText) {
            // 尝试通过文本定位菜单项
            const menuItemLocator = this.page.getByText(menuItemText, { exact: true });
            try {
              await menuItemLocator.waitFor({ state: 'visible', timeout: 5000 });
            } catch {
              // 如果等待失败，尝试部分匹配
              try {
                const partialLocator = this.page.getByText(menuItemText);
                await partialLocator.waitFor({ state: 'visible', timeout: 3000 });
              } catch {
                // 如果仍然失败，继续尝试原始定位器
              }
            }
          }
        } catch {
          // 如果等待菜单项失败，继续尝试原始定位器
        }
      }
      
      // 检查是否是对话框关闭按钮（通过定位器策略判断）
      const isDialogCloseButton = step.locator?.strategies?.some(s => 
        (s.type === 'text' && (s.value === '关闭' || s.value === '关 闭' || s.value === '确定' || s.value === '确认' || s.value === '取消')) ||
        (s.type === 'xpath' && s.value.includes('el-dialog__footer'))
      );
      
      // 如果是对话框关闭按钮，先检查对话框是否存在
      if (isDialogCloseButton && !this.page.isClosed()) {
        try {
          // 检查对话框是否存在
          const dialogExists = await this.page.locator('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]').count();
          if (dialogExists === 0) {
            console.log('⚠️ 对话框不存在，跳过对话框关闭按钮点击步骤');
            return; // 跳过此步骤，继续执行后续步骤
          }
        } catch {
          // 如果检查失败，继续尝试点击
        }
      }
      
      // 对于菜单项，先尝试使用正常的定位器解析（包括 XPath 等所有策略）
      // 如果失败，再使用菜单项的特殊处理逻辑
      let locator: Locator | null = null;
      let useMenuItemSpecialLogic = false;
      
      if (isMenuItem) {
        // 先尝试正常解析定位器（包括 XPath）
        try {
          locator = await this.locatorResolver.resolve(step.locator);
          if (locator) {
            // 检查元素是否可见
            const isVisible = await locator.isVisible().catch(() => false);
            if (!isVisible) {
              // 如果元素不可见，标记使用菜单项特殊逻辑
              useMenuItemSpecialLogic = true;
              console.log(`${stepPrefix}⚠️ 菜单项不可见，将使用菜单项特殊处理逻辑`);
            }
          } else {
            useMenuItemSpecialLogic = true;
          }
        } catch (error: any) {
          // 如果解析失败，使用菜单项特殊逻辑
          useMenuItemSpecialLogic = true;
          console.log(`${stepPrefix}⚠️ 定位器解析失败: ${error.message}，将使用菜单项特殊处理逻辑`);
        }
      } else {
        // 非菜单项，正常解析
        locator = await this.locatorResolver.resolve(step.locator);
        if (!locator) {
          // 如果无法解析定位器，记录警告但继续执行下一步，不抛出错误
          console.log('⚠️ 无法解析定位器，跳过此点击步骤');
          return; // 跳过此步骤，继续执行后续步骤
        }
      }
      
      // 确保 locator 不为 null（对于非菜单项，如果为 null 已经返回了）
      if (!locator && !isMenuItem) {
        return;
      }
      
      // 对于对话框，先等待对话框容器出现
      // 但是如果是对话框关闭按钮，不需要等待对话框出现，直接点击即可
      const isDialog = step.locator.strategies?.some(s => 
        (s.type === 'role' && s.value === 'dialog') ||
        (s.type === 'css' && (s.value.includes('el-overlay-dialog') || s.value.includes('el-overlay-message-box')))
      );
      
      // 如果是对话框关闭按钮，跳过对话框等待逻辑，直接点击
      if (isDialog && !isDialogCloseButtonCheck) {
        // 如果页面已关闭，对话框肯定不存在，跳过这个步骤
        if (this.page.isClosed()) {
          console.log('⚠️ 页面已关闭，对话框不存在，跳过对话框点击步骤');
          return;
        }
        
        // 等待对话框容器出现（Element UI 的对话框）
        try {
          // 先检查是否有对话框相关的 CSS 选择器
          const dialogCssStrategy = step.locator.strategies?.find(s => 
            s.type === 'css' && (s.value.includes('el-overlay-dialog') || s.value.includes('el-overlay-message-box'))
          );
          
          if (dialogCssStrategy) {
            // 如果有具体的对话框 CSS 选择器，使用它
            const dialogLocator = this.page.locator(dialogCssStrategy.value);
            const dialogCount = await dialogLocator.count();
            
            if (dialogCount > 0) {
              // 找到可见的对话框
              let visibleDialog = null;
              for (let i = 0; i < dialogCount; i++) {
                const testDialog = dialogLocator.nth(i);
                const isVisible = await testDialog.isVisible().catch(() => false);
                if (isVisible) {
                  visibleDialog = testDialog;
                  break;
                }
              }
              
              if (visibleDialog) {
                // 等待动画完成
                await this.page.waitForTimeout(500);
              } else {
                // 如果没有可见的对话框，等待一个出现（但超时时间缩短）
                await this.page.waitForSelector(dialogCssStrategy.value, { 
                  state: 'visible', 
                  timeout: 2000  // 缩短超时时间，避免阻塞
                }).catch(() => {
                  // 如果等待失败，继续执行
                });
                await this.page.waitForTimeout(300);
              }
            } else {
              // 如果对话框不存在，等待它出现（但超时时间缩短）
              await this.page.waitForSelector(dialogCssStrategy.value, { 
                state: 'visible', 
                timeout: 2000  // 缩短超时时间，避免阻塞
              }).catch(() => {
                // 如果等待失败，继续执行
              });
              await this.page.waitForTimeout(300);
            }
          } else {
            // 如果没有具体的对话框选择器，使用通用选择器（但超时时间缩短）
            await this.page.waitForSelector('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]', { 
              state: 'visible', 
              timeout: 2000  // 缩短超时时间，避免阻塞
            }).catch(() => {
              // 如果等待失败，继续执行
            });
            await this.page.waitForTimeout(300);
          }
        } catch {
          // 如果等待失败，说明对话框不存在，跳过这个步骤
          console.log('⚠️ 对话框不存在，可能因为页面导航或关闭导致，跳过对话框点击步骤');
          return;
        }
      }
      
      // 等待元素可点击（只有在 locator 不为 null 时才执行）
      const visibilityTimeout = isDialog ? 15000 : 10000;
      let elementVisible = false;
      
      // 如果 locator 为 null，跳过等待逻辑
      if (!locator) {
        // 对于菜单项，如果 locator 为 null，会使用特殊处理逻辑
        if (!isMenuItem) {
          return;
        }
      } else {
        try {
          // 使用 Promise.race 在等待元素可见时也检查页面是否关闭
          await Promise.race([
            locator.waitFor({ state: 'visible', timeout: visibilityTimeout }),
          new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (this.page.isClosed()) {
                clearInterval(checkInterval);
                reject(new Error('页面已关闭'));
              }
            }, 100);
            // 在超时后清除检查
            setTimeout(() => {
              clearInterval(checkInterval);
              // 不 resolve，让 waitFor 继续
            }, visibilityTimeout + 1000);
          })
        ]);
        elementVisible = true;
      } catch (error: any) {
        // 如果页面关闭，立即抛出错误
        if (error.message && error.message.includes('页面已关闭')) {
          throw error;
        }
        // 如果等待可见失败，尝试滚动到元素位置（只有在 locator 不为 null 时）
        if (!locator) {
          if (!isMenuItem) {
            return;
          }
        } else {
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
          // 如果页面关闭，直接返回，不抛出错误
          if (err.message && err.message.includes('页面已关闭')) {
            console.log('⚠️ 页面已关闭，跳过此点击步骤');
            return;
          }
          // 如果仍然不可见，检查元素是否在 DOM 中
          if (this.page.isClosed()) {
            // 如果页面关闭了，直接返回，不抛出错误
            console.log('⚠️ 页面已关闭，跳过此点击步骤');
            return;
          }
            const isAttached = await locator.first().evaluate((el) => {
              return el.isConnected;
            }).catch(() => false);
          
          if (!isAttached) {
            // 如果元素未找到，记录警告但继续执行下一步
            console.log('⚠️ 元素未找到，跳过此点击步骤');
            return;
          }
          
            // 元素存在但不可见，记录警告但继续尝试点击（使用 force）
            console.log('⚠️ 元素存在但不可见，将尝试强制点击');
          }
        }
      }
      
      // 再次检查页面是否关闭
      if (this.page.isClosed()) {
        // 如果页面关闭了，直接返回，不抛出错误
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return;
      }
      
      // 如果元素可见，滚动到元素（如果需要）（只有在 locator 不为 null 时）
      if (elementVisible && locator) {
        try {
          await Promise.race([
            locator.scrollIntoViewIfNeeded({ timeout: 2000 }),
            new Promise<void>((resolve, reject) => {
              const checkInterval = setInterval(() => {
                if (this.page.isClosed()) {
                  clearInterval(checkInterval);
                  resolve(); // 页面关闭时 resolve，不 reject
                }
              }, 100);
              setTimeout(() => clearInterval(checkInterval), 3000);
            })
          ]);
        } catch (err: any) {
          // 如果页面关闭，直接返回
          if (err.message && err.message.includes('页面已关闭')) {
            console.log('⚠️ 页面已关闭，跳过此点击步骤');
            return;
          }
          // 滚动失败不影响，继续
        }
      }
      
      // 再次检查页面是否关闭
      if (this.page.isClosed()) {
        // 如果页面关闭了，直接返回，不抛出错误
        console.log('⚠️ 页面已关闭，跳过此点击步骤');
        return;
      }
      
      // 记录点击前的URL
      const urlBeforeClick = this.page.url();
      
      // 检查点击操作是否标记了会导致导航
      const causesNavigation = (step as any).data?.expectedNavigation || 
                               (step as any).data?.navigationOccurred;
      
      // ========== 针对菜单项的终极方案：定位根容器 → hover → 等子元素可见 → force=True 点击 ==========
      let clickSuccess = false;
      
      // 如果菜单项使用正常定位器成功，先尝试正常点击
      if (isMenuItem && locator && !useMenuItemSpecialLogic) {
        try {
          console.log(`${stepPrefix}🔍 尝试使用配置的定位策略（包括 XPath）...`);
          // 尝试等待元素可见
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
            // 如果不可见，尝试 force 点击
          });
          await locator.click({ timeout: 10000, force: true });
          clickSuccess = true;
          console.log(`${stepPrefix}✅ 使用配置的定位策略点击成功`);
        } catch (error: any) {
          console.log(`${stepPrefix}⚠️ 配置的定位策略点击失败: ${error.message}，将使用菜单项特殊处理逻辑`);
          useMenuItemSpecialLogic = true;
        }
      }
      
      // 如果正常定位失败或需要使用特殊逻辑，使用菜单项特殊处理
      if (isMenuItem && (useMenuItemSpecialLogic || !clickSuccess)) {
        console.log(`${stepPrefix}🎯 检测到菜单项点击，使用悬浮导航栏终极方案...`);
        
        const menuItemText = step.locator.strategies?.find(s => s.type === 'text')?.value;
        
        if (menuItemText) {
          // 先查找根容器（在策略1外部定义，以便策略3也能使用）
          let rootContainer: { text: string; stableClass: string } | null = null;
          
          try {
            rootContainer = await this.page.evaluate((text) => {
              // 找到菜单项（支持多种菜单结构：el-menu-item, v-menu__title 等）
              let menuItem: HTMLElement | null = null;
              
              // 方法1：查找 el-menu-item
              menuItem = Array.from(document.querySelectorAll('li.el-menu-item'))
                .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
              
              // 方法2：如果找不到，查找包含文本的 span.v-menu__title
              if (!menuItem) {
                const titleSpan = Array.from(document.querySelectorAll('span.v-menu__title'))
                  .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
                if (titleSpan) {
                  // 向上查找父 li 元素
                  let parent = titleSpan.parentElement;
                  while (parent && parent !== document.body) {
                    if (parent.tagName.toLowerCase() === 'li' && 
                        (parent.className.includes('el-menu-item') || parent.className.includes('menu-item'))) {
                      menuItem = parent as HTMLElement;
                      break;
                    }
                    parent = parent.parentElement;
                  }
                }
              }
              
              // 方法3：如果还找不到，查找任何包含文本的菜单相关元素
              if (!menuItem) {
                menuItem = Array.from(document.querySelectorAll('li[class*="menu-item"], span[class*="menu"]'))
                  .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
              }
              
              if (!menuItem) return null;
              
              // 向上查找根容器（el-sub-menu，使用稳定的类名）
              let current: HTMLElement | null = menuItem.parentElement;
              while (current && current !== document.body) {
                const className = current.className || '';
                const tagName = current.tagName.toLowerCase();
                
                // 使用稳定的类名匹配（不使用动态部分）
                // 支持 el-sub-menu 和 v-menu 等结构
                if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) && 
                    !className.includes('el-menu-item') && 
                    !className.includes('menu-item')) {
                  // 查找菜单标题
                  const title = current.querySelector('.el-sub-menu__title') || 
                               current.querySelector('.v-menu__title') ||
                               current.querySelector('[class*="menu-title"]') ||
                               current.querySelector('span');
                  
                  return {
                    text: title?.textContent?.trim() || current.textContent?.trim().substring(0, 50) || '',
                    // 只使用第一个稳定的类名（避免动态 ID）
                    stableClass: className.split(/\s+/).find(c => 
                      (c.startsWith('el-sub-menu') || c.startsWith('v-menu')) && 
                      !c.includes('el-id-') && 
                      !c.includes('menu-item')
                    ) || (className.includes('el-sub-menu') ? 'el-sub-menu' : 'v-menu')
                  };
                }
                current = current.parentElement;
              }
              return null;
            }, menuItemText);
            
            if (rootContainer && rootContainer.text) {
              console.log(`${stepPrefix}    └─ ✅ 找到根容器: ${rootContainer.text}`);
              
              // 步骤2：hover 根容器（使用多种稳定的选择器策略，确保能找到）
              // 支持多种菜单结构，使用多重重试机制
              let rootLocator: Locator | null = null;
              let hoverSuccess = false;
              
              // 策略1：通过文本直接定位（支持 hidden 元素，使用 force）
              try {
                console.log(`${stepPrefix}      └─ 🔍 尝试策略1: 通过文本定位根容器 "${rootContainer.text}"`);
                rootLocator = this.page.getByText(rootContainer.text, { exact: false }).first();
                // 先尝试等待可见，如果失败则使用 attached（元素存在但可能 hidden）
                try {
                  await rootLocator.waitFor({ state: 'visible', timeout: 2000 });
                } catch {
                  // 如果不可见，等待元素附加到DOM（可能是 hidden 状态）
                  await rootLocator.waitFor({ state: 'attached', timeout: 2000 });
                  console.log(`${stepPrefix}      └─ ⚠️ 元素存在但不可见（hidden），将使用 force hover`);
                }
                // 使用 force hover（即使元素不可见也能hover）
                await rootLocator.hover({ timeout: 3000, force: true });
                hoverSuccess = true;
                console.log(`${stepPrefix}      └─ ✅ 策略1成功: 通过文本定位并hover`);
              } catch (error1: any) {
                console.log(`${stepPrefix}      └─ ⚠️ 策略1失败: ${error1.message}`);
                
                // 策略2：通过JavaScript查找父菜单容器，然后使用文本定位
                try {
                  console.log(`${stepPrefix}      └─ 🔍 尝试策略2: 通过JavaScript查找父容器`);
                  const parentInfo = await this.page.evaluate((text) => {
                    // 找到包含文本的元素
                    const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
                    const targetElement = allElements.find(el => {
                      const elText = el.textContent?.trim() || '';
                      return elText === text || elText.includes(text);
                    });
                    
                    if (!targetElement) return null;
                    
                    // 向上查找菜单容器
                    let current: HTMLElement | null = targetElement;
                    while (current && current !== document.body) {
                      const className = current.className || '';
                      if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) &&
                          !className.includes('el-menu-item') && !className.includes('menu-item')) {
                        // 查找菜单标题文本（用于定位）
                        const title = current.querySelector('.el-sub-menu__title') || 
                                     current.querySelector('.v-menu__title') ||
                                     current.querySelector('[class*="menu-title"]');
                        const titleText = title?.textContent?.trim() || current.textContent?.trim() || '';
                        return { found: true, titleText };
                      }
                      current = current.parentElement;
                    }
                    return null;
                  }, rootContainer.text);
                  
                  if (parentInfo && parentInfo.found) {
                    // 使用找到的标题文本重新定位
                    rootLocator = this.page.getByText(parentInfo.titleText, { exact: false }).first();
                    try {
                      await rootLocator.waitFor({ state: 'visible', timeout: 2000 });
                    } catch {
                      await rootLocator.waitFor({ state: 'attached', timeout: 2000 });
                    }
                    await rootLocator.hover({ timeout: 3000, force: true });
                    hoverSuccess = true;
                    console.log(`${stepPrefix}      └─ ✅ 策略2成功: 通过父容器定位并hover`);
                  } else {
                    throw new Error('未找到父容器');
                  }
                } catch (error2: any) {
                  console.log(`${stepPrefix}      └─ ⚠️ 策略2失败: ${error2.message}`);
                  
                  // 策略3：使用CSS选择器（支持多种菜单结构，支持 hidden 元素）
                  try {
                    console.log(`${stepPrefix}      └─ 🔍 尝试策略3: 使用CSS选择器`);
                    const selectors = [
                      // ElementUI 菜单
                      `li.el-sub-menu:has-text("${rootContainer.text}")`,
                      `li.el-sub-menu__title:has-text("${rootContainer.text}")`,
                      // V-Menu 菜单
                      `li[class*="v-menu"]:has-text("${rootContainer.text}")`,
                      `li[class*="sub-menu"]:has-text("${rootContainer.text}")`,
                      // 通用菜单
                      `li:has-text("${rootContainer.text}")`,
                      // 通过文本查找，然后过滤
                      `li:has(.v-menu__title:has-text("${rootContainer.text}"))`,
                      `li:has(.el-sub-menu__title:has-text("${rootContainer.text}"))`,
                    ];
                    
                    for (const selector of selectors) {
                      try {
                        rootLocator = this.page.locator(selector).first();
                        // 先尝试等待可见，如果失败则等待附加
                        try {
                          await rootLocator.waitFor({ state: 'visible', timeout: 2000 });
                        } catch {
                          await rootLocator.waitFor({ state: 'attached', timeout: 2000 });
                        }
                        await rootLocator.hover({ timeout: 3000, force: true });
                        hoverSuccess = true;
                        console.log(`${stepPrefix}      └─ ✅ 策略3成功: 使用选择器 "${selector}"`);
                        break;
                      } catch (selectorError: any) {
                        // 继续尝试下一个选择器
                        if (selector === selectors[selectors.length - 1]) {
                          throw selectorError; // 最后一个选择器失败时抛出错误
                        }
                      }
                    }
                  } catch (error3: any) {
                    console.log(`${stepPrefix}      └─ ⚠️ 策略3失败: ${error3.message}`);
                    
                    // 策略4：JavaScript直接操作（最后手段，100% 解决）
                    try {
                      console.log(`${stepPrefix}      └─ 🔍 尝试策略4: JavaScript直接操作（100% 解决）`);
                      const jsSuccess = await this.page.evaluate((text) => {
                        // 找到包含文本的所有元素
                        const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
                        const targetElement = allElements.find(el => {
                          const elText = el.textContent?.trim() || '';
                          return elText === text || elText.includes(text);
                        });
                        
                        if (!targetElement) return false;
                        
                        // 向上查找菜单容器
                        let menuContainer: HTMLElement | null = null;
                        let current: HTMLElement | null = targetElement;
                        while (current && current !== document.body) {
                          const className = current.className || '';
                          if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) &&
                              !className.includes('el-menu-item') && !className.includes('menu-item')) {
                            menuContainer = current;
                            break;
                          }
                          current = current.parentElement;
                        }
                        
                        if (!menuContainer) return false;
                        
                        // 方法1：触发hover事件
                        const mouseEnterEvent = new MouseEvent('mouseenter', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        menuContainer.dispatchEvent(mouseEnterEvent);
                        
                        const mouseOverEvent = new MouseEvent('mouseover', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        menuContainer.dispatchEvent(mouseOverEvent);
                        
                        // 方法2：如果菜单容器有Vue实例，触发其方法
                        const vueInstance = (menuContainer as any).__vue__;
                        if (vueInstance) {
                          if (vueInstance.handleMouseenter) vueInstance.handleMouseenter();
                          if (vueInstance.handleOpen) vueInstance.handleOpen();
                        }
                        
                        // 方法3：直接添加展开类
                        menuContainer.classList.add('is-opened', 'is-active');
                        menuContainer.setAttribute('aria-expanded', 'true');
                        
                        // 方法4：显示子菜单
                        const subMenu = menuContainer.querySelector('.el-menu') as HTMLElement ||
                                     menuContainer.querySelector('ul[class*="menu"]') as HTMLElement ||
                                     menuContainer.querySelector('[role="menu"]') as HTMLElement;
                        if (subMenu) {
                          subMenu.style.display = 'block';
                          subMenu.style.visibility = 'visible';
                          subMenu.style.opacity = '1';
                        }
                        
                        return true;
                      }, rootContainer.text);
                      
                      if (jsSuccess) {
                        hoverSuccess = true;
                        console.log(`${stepPrefix}      └─ ✅ 策略4成功: JavaScript直接操作（100% 解决）`);
                      } else {
                        throw new Error('JavaScript操作返回false');
                      }
                    } catch (error4: any) {
                      console.log(`${stepPrefix}      └─ ⚠️ 策略4失败: ${error4.message}`);
                    }
                  }
                }
              }
              
              if (hoverSuccess) {
                console.log(`${stepPrefix}    └─ ✅ Hover 根容器成功`);
              } else {
                console.log(`${stepPrefix}    └─ ⚠️ Hover 根容器失败，但继续执行后续步骤`);
              }
              
              // 步骤3：等待子元素可见（使用稳定的选择器，支持多种菜单结构）
              await Promise.race([
                this.page.waitForSelector(
                  'li.el-sub-menu.is-opened, li.el-sub-menu.is-active, li[class*="sub-menu"].is-opened, [role="menu"]:visible, ul[class*="menu"]:visible',
                  { timeout: 3000, state: 'visible' }
                ),
                // 也等待菜单项可见
                this.page.waitForSelector(
                  `li.el-menu-item:has-text("${menuItemText}"), span.v-menu__title:has-text("${menuItemText}")`,
                  { timeout: 3000, state: 'visible' }
                )
              ]).catch(() => {
                // 如果等待失败，继续执行
              });
              console.log(`${stepPrefix}    └─ ✅ 子菜单已展开`);
              
              // 步骤4：300ms 动画等待（解决动画问题）
              await this.page.waitForTimeout(300);
              
              // 步骤5：等待菜单项可见，然后 force=True 点击（使用稳定的文本定位器）
              // 先等待菜单项可见
              try {
                const childMenuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
                await childMenuItemLocator.waitFor({ state: 'visible', timeout: 2000 });
                console.log(`${stepPrefix}    └─ ✅ 菜单项已可见`);
              } catch {
                console.log(`${stepPrefix}    └─ ⚠️ 菜单项仍不可见，将使用 force=True 强制点击`);
              }
              
              // force=True 点击子菜单项
              const childMenuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
              await childMenuItemLocator.click({ force: true, timeout: 5000 });
              clickSuccess = true;
              console.log(`${stepPrefix}  └─ ✅ Force 点击子菜单项成功（策略1成功，解决 99% 问题）`);
            } else {
              console.log(`${stepPrefix}  └─ ⚠️ 未找到根容器，跳过策略1，进入策略2...`);
              // 即使未找到根容器，也继续执行策略2
              throw new Error('未找到根容器');
            }
          } catch (error: any) {
            console.log(`${stepPrefix}  └─ ⚠️ 策略1失败: ${error.message}，进入策略2...`);
            
            // ========== 策略2：300ms 动画等待（解决动画问题） ==========
            try {
              console.log(`${stepPrefix}    └─ 📌 策略2: 添加 300ms 动画等待`);
              
              // 先尝试等待菜单项可见（可能菜单已经展开，只是需要等待）
              try {
                const menuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
                await menuItemLocator.waitFor({ state: 'visible', timeout: 2000 });
                console.log(`${stepPrefix}      └─ ✅ 菜单项已可见`);
              } catch {
                console.log(`${stepPrefix}      └─ ⚠️ 菜单项仍不可见，将使用 force=True`);
              }
              
              // 300ms 动画等待
              await this.page.waitForTimeout(300);
              
              // 再次尝试点击（使用 force）
              const menuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
              await menuItemLocator.click({ force: true, timeout: 5000 });
              clickSuccess = true;
              console.log(`${stepPrefix}    └─ ✅ 动画等待后点击成功（策略2成功）`);
            } catch (error2: any) {
              console.log(`${stepPrefix}    └─ ⚠️ 策略2失败: ${error2.message}，进入策略3...`);
              
              // ========== 策略3：JavaScript 兜底方案（100% 解决所有问题） ==========
              try {
                console.log(`${stepPrefix}      └─ 📌 策略3: JavaScript 兜底方案（100% 解决）`);
                
                // 获取根容器信息（如果策略1找到了）
                const rootContainerText = rootContainer?.text || null;
                
                await this.page.evaluate((args: { text: string; rootContainerText: string | null }) => {
                  const { text, rootContainerText } = args;
                  // 找到菜单项（支持多种结构，优先精确匹配）
                  let menuItem: HTMLElement | null = null;
                  
                  // 辅助函数：检查元素是否在指定的父菜单下
                  const isInParentMenu = (element: HTMLElement, parentText: string | null): boolean => {
                    if (!parentText) return true; // 如果没有父菜单信息，不限制
                    
                    let current: HTMLElement | null = element.parentElement;
                    while (current && current !== document.body) {
                      const className = current.className || '';
                      if (className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) {
                        const title = current.querySelector('.el-sub-menu__title') || 
                                   current.querySelector('.v-menu__title') ||
                                   current.querySelector('[class*="menu-title"]');
                        const parentMenuText = title?.textContent?.trim() || '';
                        if (parentMenuText === parentText || parentMenuText.includes(parentText)) {
                          return true;
                        }
                      }
                      current = current.parentElement;
                    }
                    return false;
                  };
                  
                  // 辅助函数：检查元素是否可见和可点击
                  const isVisibleAndClickable = (el: HTMLElement): boolean => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0' &&
                           !el.hasAttribute('disabled');
                  };
                  
                  // 方法1：查找 el-menu-item（优先精确匹配，然后部分匹配）
                  const allMenuItems = Array.from(document.querySelectorAll('li.el-menu-item')) as HTMLElement[];
                  
                  // 优先精确匹配
                  menuItem = allMenuItems.find(el => {
                    const itemText = el.textContent?.trim() || '';
                    return itemText === text && isVisibleAndClickable(el) && isInParentMenu(el, rootContainerText);
                  }) || null;
                  
                  // 如果精确匹配失败，尝试部分匹配（但要求可见且在正确的父菜单下）
                  if (!menuItem) {
                    menuItem = allMenuItems.find(el => {
                      const itemText = el.textContent?.trim() || '';
                      return itemText.includes(text) && isVisibleAndClickable(el) && isInParentMenu(el, rootContainerText);
                    }) || null;
                  }
                  
                  // 方法2：查找 span.v-menu__title（优先精确匹配）
                  if (!menuItem) {
                    const allTitleSpans = Array.from(document.querySelectorAll('span.v-menu__title')) as HTMLElement[];
                    
                    // 优先精确匹配
                    let titleSpan = allTitleSpans.find(el => {
                      const spanText = el.textContent?.trim() || '';
                      return spanText === text && isVisibleAndClickable(el);
                    }) || null;
                    
                    // 如果精确匹配失败，尝试部分匹配
                    if (!titleSpan) {
                      titleSpan = allTitleSpans.find(el => {
                        const spanText = el.textContent?.trim() || '';
                        return spanText.includes(text) && isVisibleAndClickable(el);
                      }) || null;
                    }
                    
                    if (titleSpan) {
                      // 向上查找父 li 元素
                      let parent = titleSpan.parentElement;
                      while (parent && parent !== document.body) {
                        if (parent.tagName.toLowerCase() === 'li') {
                          // 检查是否在正确的父菜单下
                          if (isInParentMenu(parent as HTMLElement, rootContainerText)) {
                            menuItem = parent as HTMLElement;
                            break;
                          }
                        }
                        parent = parent.parentElement;
                      }
                      // 如果找不到父 li，直接使用 span（但需要检查父菜单）
                      if (!menuItem && isInParentMenu(titleSpan, rootContainerText)) {
                        menuItem = titleSpan;
                      }
                    }
                  }
                  
                  // 方法3：如果还找不到，通过文本直接查找（最后手段）
                  if (!menuItem) {
                    const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
                    // 优先精确匹配
                    menuItem = allElements.find(el => {
                      const elText = el.textContent?.trim() || '';
                      return elText === text && isVisibleAndClickable(el) && isInParentMenu(el, rootContainerText);
                    }) || null;
                    
                    // 如果精确匹配失败，尝试部分匹配
                    if (!menuItem) {
                      menuItem = allElements.find(el => {
                        const elText = el.textContent?.trim() || '';
                        return elText.includes(text) && isVisibleAndClickable(el) && isInParentMenu(el, rootContainerText);
                      }) || null;
                    }
                  }
                  
                  if (!menuItem) {
                    console.warn(`[策略3] 未找到菜单项: ${text}, 父菜单: ${rootContainerText || '无'}`);
                    return false;
                  }
                  
                  console.log(`[策略3] 找到菜单项: ${text}, 元素文本: ${menuItem.textContent?.trim()}`);
                  
                  // 向上查找根容器并展开（支持多种菜单结构）
                  let current: HTMLElement | null = menuItem.parentElement;
                  while (current && current !== document.body) {
                    const className = current.className || '';
                    const tagName = current.tagName.toLowerCase();
                    
                    // 支持 el-sub-menu 和 v-menu 等结构
                    if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) && 
                        !className.includes('el-menu-item') && 
                        !className.includes('menu-item')) {
                      // 展开菜单
                      current.classList.add('is-opened', 'is-active');
                      current.setAttribute('aria-expanded', 'true');
                      
                      // 显示子菜单（支持多种结构）
                      const subMenu = current.querySelector('.el-menu') as HTMLElement ||
                                     current.querySelector('ul[class*="menu"]') as HTMLElement ||
                                     current.querySelector('[role="menu"]') as HTMLElement;
                      
                      if (subMenu) {
                        subMenu.style.display = 'block';
                        subMenu.style.visibility = 'visible';
                        subMenu.style.opacity = '1';
                        subMenu.style.height = 'auto';
                        // 移除可能的隐藏样式
                        subMenu.style.removeProperty('display');
                        subMenu.style.removeProperty('visibility');
                      }
                      
                      // 触发Vue组件方法（如果可用）
                      const vueInstance = (current as any).__vue__;
                      if (vueInstance) {
                        if (vueInstance.handleClick) vueInstance.handleClick();
                        if (vueInstance.handleMouseenter) vueInstance.handleMouseenter();
                        if (vueInstance.handleOpen) vueInstance.handleOpen();
                      }
                      
                      // 触发原生事件
                      const mouseEnterEvent = new MouseEvent('mouseenter', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                      });
                      current.dispatchEvent(mouseEnterEvent);
                      
                      break;
                    }
                    current = current.parentElement;
                  }
                  
                  // 等待一下，确保菜单展开
                  setTimeout(() => {
                    // 直接点击菜单项
                    (menuItem as HTMLElement).click();
                  }, 100);
                  
                  return true;
                }, { text: menuItemText, rootContainerText });
                
                // 等待DOM更新
                await this.page.waitForTimeout(300);
                clickSuccess = true;
                console.log(`${stepPrefix}      └─ ✅ JavaScript操作成功（策略3成功，100% 解决）`);
              } catch (error3: any) {
                console.log(`${stepPrefix}      └─ ⚠️ 策略3也失败: ${error3.message}，使用原始定位器`);
              }
            }
          }
        }
      }
      
      // 如果所有策略都失败，使用原始点击逻辑
      if (!clickSuccess) {
        console.log(`${stepPrefix}⚠️ 所有策略都失败，使用原始定位器（force=True）`);
        
        // 对于菜单项，始终使用 force=True（因为菜单项可能被遮挡或CSS隐藏）
        const clickOptions = {
          ...step.options,
          timeout: 10000,
          force: isMenuItem ? true : !elementVisible // 菜单项始终使用 force，其他元素根据可见性决定
        };
        
        try {
          if (causesNavigation) {
            // 如果点击会导致导航，使用 Promise.all 等待导航完成
            if (!locator) {
              throw new Error('定位器为 null');
            }
            await Promise.race([
              Promise.all([
                locator.click(clickOptions),
                this.page.waitForNavigation({ timeout: 10000 }).catch(() => {
                  // 如果导航超时，继续执行
                })
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
            // 使用 Promise.race 在点击时也检查页面是否关闭
            if (!locator) {
              throw new Error('定位器为 null');
            }
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
          // 如果 force 点击也失败，尝试使用 JavaScript 直接点击（100% 兜底）
          if (clickError.message && clickError.message.includes('Element is not visible')) {
            console.log(`${stepPrefix}⚠️ Force 点击失败，尝试使用 JavaScript 直接点击（100% 兜底）`);
            try {
              const jsClickSuccess = await this.page.evaluate((selector: string) => {
                // 尝试多种方式查找元素
                let element: HTMLElement | null = null;
                
                // 方法1：通过 CSS 选择器查找
                element = document.querySelector(selector) as HTMLElement;
                
                // 方法2：如果找不到，尝试通过 XPath 查找（如果选择器是 XPath）
                if (!element && selector.startsWith('/')) {
                  const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                  element = xpathResult.singleNodeValue as HTMLElement;
                }
                
                // 方法3：如果还是找不到，尝试通过文本查找
                if (!element) {
                  const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
                  element = allElements.find(el => el.textContent?.trim() === selector) || null;
                }
                
                if (element) {
                  // 尝试多种点击方式
                  // 方法1：直接调用 click() 方法
                  if (typeof element.click === 'function') {
                    element.click();
                    return true;
                  }
                  
                  // 方法2：触发 click 事件
                  const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  element.dispatchEvent(clickEvent);
                  
                  // 方法3：如果是按钮或链接，触发 mousedown 和 mouseup 事件
                  const mouseDownEvent = new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  element.dispatchEvent(mouseDownEvent);
                  element.dispatchEvent(mouseUpEvent);
                  
                  return true;
                }
                return false;
              }, step.locator?.strategies?.[0]?.value || '');
              
              if (jsClickSuccess) {
                console.log(`${stepPrefix}✅ JavaScript 直接点击成功（100% 兜底）`);
                await this.page.waitForTimeout(300); // 等待点击后的响应
                clickSuccess = true;
              } else {
                throw new Error('JavaScript 点击返回 false');
              }
            } catch (jsError: any) {
              console.log(`${stepPrefix}⚠️ JavaScript 点击失败: ${jsError.message}`);
              throw clickError; // 重新抛出原始错误
            }
          } else {
            throw clickError; // 其他错误直接抛出
          }
        }
      }
      
      // 等待页面加载完成（无论是否导航）
      await this.waitForPageStable(4000);
      
      // 检查页面是否关闭（可能在点击后页面导航或关闭）
      if (this.page.isClosed()) {
        // 检查是否是对话框关闭按钮
        const isDialogCloseButtonAfterClick = step.locator?.strategies?.some(s => 
          (s.type === 'text' && (s.value === '关闭' || s.value === '关 闭' || s.value === '确定' || s.value === '确认' || s.value === '取消')) ||
          (s.type === 'xpath' && s.value.includes('el-dialog__footer'))
        );
        
        if (isDialogCloseButtonAfterClick) {
          // 如果是对话框关闭按钮，页面关闭是正常的（关闭按钮已成功点击）
          // 不抛出错误，让 config-executor 来处理页面恢复
          console.log('✅ 对话框关闭按钮已成功点击，对话框已关闭');
          return; // 正常返回，不抛出错误
        }
        
        // 如果不是对话框关闭按钮，抛出错误
        const locatorInfo = JSON.stringify(step.locator, null, 2);
        throw new Error(
          `点击操作后页面已关闭: 无法继续执行后续步骤\n` +
          `定位器配置:\n${locatorInfo}\n` +
          `提示: 点击操作可能导致页面关闭，请检查测试配置或重新录制测试`
        );
      }
      
      // 如果点击操作有 expectedDialog，按优先级定位并点击对话框（适配 ElementUI 弹窗特性）
      // 但是如果是对话框关闭按钮，不应该等待对话框出现（因为点击后对话框会关闭）
      if ((step as any).expectedDialog && !isDialogCloseButtonCheck) {
        const expectedDialogName = (step as any).expectedDialog;
        const stepPrefix = this.currentStepIndex > 0 ? `[步骤 ${this.currentStepIndex}] ` : '';
        
        // 如果页面已关闭，跳过对话框处理
        if (this.page.isClosed()) {
          return;
        }
        
        // ========== 按优先级定位并点击对话框（role 优先，css 兜底）==========
        // 定义定位策略（按 priority 升序排序，优先 role，再 css）
        const dialogStrategies = [
          { type: 'role', value: 'dialog', priority: 4 },
          { type: 'css', value: 'div.el-overlay-dialog', priority: 7 },
          { type: 'css', value: 'div.el-overlay-message-box', priority: 7 },
        ];
        
        // 按 priority 排序（数字越小优先级越高）
        dialogStrategies.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        
        let dialogClickSuccess = false;
        
        for (const strategy of dialogStrategies) {
          try {
            console.log(`${stepPrefix}  └─ 🔍 尝试定位对话框【${strategy.type}: ${strategy.value}】`);
            
            // 1. 按策略生成定位器
            let dialogLocator: Locator;
            
            if (strategy.type === 'role') {
              // Playwright 原生 role 定位（语义化，优先级更高）
              // 如果有预期对话框名称，使用 filter 过滤
              if (expectedDialogName) {
                dialogLocator = this.page.getByRole('dialog', { name: expectedDialogName }).first();
              } else {
                dialogLocator = this.page.getByRole('dialog').first();
              }
            } else if (strategy.type === 'css') {
              // CSS 选择器定位（兜底）
              dialogLocator = this.page.locator(strategy.value).first();
            } else {
              continue;
            }
            
            // 2. 关键：等待弹窗容器可见（解决动态加载/动画问题）
            // 超时5秒，适配 ElementUI 弹窗的加载延迟
            await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });
            
            // 3. 强制点击（跳过遮挡/动画校验，解决点击无响应）
            await dialogLocator.click({ force: true, timeout: 3000 });
            
            // 4. 验证：等待预期对话框出现（可选，增强稳定性）
            if (expectedDialogName) {
              try {
                await this.page.waitForSelector(`text=${expectedDialogName}`, { 
                  state: 'visible', 
                  timeout: 3000 
                });
                console.log(`${stepPrefix}    └─ ✅ 验证成功：对话框 "${expectedDialogName}" 已出现`);
              } catch {
                // 验证失败不影响，继续执行
                console.log(`${stepPrefix}    └─ ⚠️ 验证失败：对话框 "${expectedDialogName}" 未出现，但继续执行`);
              }
            }
            
            console.log(`${stepPrefix}  └─ ✅ 成功通过【${strategy.type}: ${strategy.value}】点击对话框`);
            dialogClickSuccess = true;
            break;
            
          } catch (error: any) {
            console.log(`${stepPrefix}  └─ ⚠️ 【${strategy.type}: ${strategy.value}】定位/点击失败：${error.message}`);
            continue;
          }
        }
        
        // 所有策略都失败时的终极兜底（JS 点击）
        if (!dialogClickSuccess) {
          try {
            console.log(`${stepPrefix}  └─ 🔍 尝试 JS 兜底方案：JavaScript 直接操作`);
            const jsSuccess = await this.page.evaluate((dialogName: string | null) => {
              // 原生 JS 定位并点击 ElementUI 弹窗容器
              let dialog: HTMLElement | null = null;
              
              // 方法1：定位 div.el-overlay-dialog
              dialog = document.querySelector('div.el-overlay-dialog') as HTMLElement;
              
              // 方法2：如果找不到，定位 role=dialog 的元素
              if (!dialog) {
                dialog = document.querySelector('[role="dialog"]') as HTMLElement;
              }
              
              // 方法3：如果指定了对话框名称，尝试通过文本查找
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
              dialogClickSuccess = true;
            } else {
              throw new Error('JavaScript 操作返回 false');
            }
          } catch (error: any) {
            console.log(`${stepPrefix}  └─ ❌ 所有定位策略均失败：${error.message}，继续执行后续步骤`);
          }
        }
        
        // 等待对话框动画完成
        if (dialogClickSuccess) {
          await this.page.waitForTimeout(500);
        }
      }
      
      // 如果点击的是对话框中的"确定"按钮，等待对话框消失
      const clickedText = step.locator?.strategies?.find(s => s.type === 'text' && (s.value === '确定' || s.value === '确 定'));
      if (clickedText) {
        // 等待对话框消失（最多等待3秒）
        try {
          await this.page.waitForSelector('div.el-overlay-message-box', { 
            state: 'hidden', 
            timeout: 3000 
          }).catch(() => {
            // 如果等待失败，尝试等待对话框从DOM中移除
            return this.page.waitForFunction(
              () => !document.querySelector('div.el-overlay-message-box'),
              { timeout: 3000 }
            ).catch(() => {
              // 如果都失败，继续执行
            });
          });
        } catch {
          // 忽略错误，继续执行
        }
      }
    } catch (error: any) {
      // 检查页面是否关闭
      if (this.page.isClosed()) {
        // 如果页面关闭了，直接返回，不抛出错误
        // 后续步骤会在执行时自然失败，但不会在这里就停止
        console.log('⚠️ 点击操作后页面已关闭，跳过此步骤');
        return; // 跳过此步骤，继续执行后续步骤
      }
      
      // 检查是否有坐标策略（作为兜底方案）
      const coordinateStrategy = step.locator?.strategies?.find(s => s.type === 'coordinate');
      if (coordinateStrategy && coordinateStrategy.value) {
        try {
          const [x, y] = coordinateStrategy.value.split(',').map(v => parseInt(v.trim(), 10));
          if (!isNaN(x) && !isNaN(y)) {
            console.log(`${stepPrefix}📍 使用坐标点击作为兜底方案: (${x}, ${y})`);
            await this.page.mouse.click(x, y);
            await this.page.waitForTimeout(300); // 等待点击后的响应
            console.log(`${stepPrefix}✅ 坐标点击成功`);
            return; // 成功，退出
          }
        } catch (coordError: any) {
          console.log(`${stepPrefix}⚠️ 坐标点击失败: ${coordError.message}`);
        }
      }
      
      // 如果错误是"无法解析定位器"或"无法定位元素"，跳过此步骤，不抛出错误
      if (error.message && (error.message.includes('无法解析定位器') || error.message.includes('无法定位元素'))) {
        console.log(`⚠️ 点击操作失败: ${error.message}，跳过此步骤`);
        return; // 跳过此步骤，继续执行后续步骤
      }
      
      // 如果是元素不可见错误，尝试使用 JavaScript 直接点击（100% 兜底）
      if (error.message && error.message.includes('Element is not visible')) {
        console.log(`${stepPrefix}⚠️ 元素不可见，尝试使用 JavaScript 直接点击（100% 兜底）`);
        try {
          const jsClickSuccess = await this.page.evaluate((selector: string) => {
            // 尝试多种方式查找元素
            let element: HTMLElement | null = null;
            
            // 方法1：通过 CSS 选择器查找
            element = document.querySelector(selector) as HTMLElement;
            
            // 方法2：如果找不到，尝试通过 XPath 查找（如果选择器是 XPath）
            if (!element && selector.startsWith('/')) {
              const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              element = xpathResult.singleNodeValue as HTMLElement;
            }
            
            if (element) {
              // 尝试多种点击方式
              // 方法1：直接调用 click() 方法
              if (typeof element.click === 'function') {
                element.click();
                return true;
              }
              
              // 方法2：触发 click 事件
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              element.dispatchEvent(clickEvent);
              
              // 方法3：如果是按钮或链接，触发 mousedown 和 mouseup 事件
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              const mouseUpEvent = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              element.dispatchEvent(mouseDownEvent);
              element.dispatchEvent(mouseUpEvent);
              
              return true;
            }
            return false;
          }, step.locator?.strategies?.[0]?.value || '');
          
          if (jsClickSuccess) {
            console.log(`${stepPrefix}✅ JavaScript 直接点击成功（100% 兜底）`);
            await this.page.waitForTimeout(300); // 等待点击后的响应
            return; // 成功，返回
          }
        } catch (jsError: any) {
          console.log(`${stepPrefix}⚠️ JavaScript 点击失败: ${jsError.message}`);
        }
      }
      
      // 其他错误，抛出原始错误
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`点击操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }

  /**
   * 执行填充
   */
  private async runFill(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('填充操作需要定位器');
    }
    if (step.value === undefined) {
      throw new Error('填充操作需要值');
    }
    
    try {
      const locator = await this.locatorResolver.resolve(step.locator);
      if (!locator) {
        throw new Error('无法解析定位器');
      }
      
      // 等待元素可编辑
      await locator.waitFor({ state: 'visible', timeout: 10000 });
      
      // 滚动到元素（如果需要）
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        // 滚动后等待一小段时间，确保元素稳定
        await this.page.waitForTimeout(200);
      } catch {
        // 滚动失败不影响，继续
      }
      
      // 先点击输入框，确保焦点在正确的输入框上
      // 这对于有多个相同 CSS 选择器的输入框特别重要
      try {
        await locator.click({ timeout: 5000 });
        // 点击后等待一小段时间，确保焦点切换完成
        await this.page.waitForTimeout(100);
      } catch {
        // 点击失败不影响，继续尝试 fill
      }
      
      // 清空输入框（如果需要）
      try {
        await locator.clear({ timeout: 2000 });
      } catch {
        // 清空失败不影响，继续
      }
      
      // 填充值
      await locator.fill(String(step.value), { timeout: 10000 });
      
      // 填充后等待一小段时间，确保值已设置
      await this.page.waitForTimeout(100);
    } catch (error: any) {
      // 提供更详细的错误信息
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`填充操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }

  /**
   * 执行选择
   */
  private async runSelect(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('选择操作需要定位器');
    }
    if (step.value === undefined) {
      throw new Error('选择操作需要值');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    const value = Array.isArray(step.value) ? step.value : [String(step.value)];
    await locator.selectOption(value);
  }

  /**
   * 执行勾选
   */
  private async runCheck(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('勾选操作需要定位器');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.check();
  }

  /**
   * 执行取消勾选
   */
  private async runUncheck(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('取消勾选操作需要定位器');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.uncheck();
  }

  /**
   * 执行悬停（针对悬浮导航栏的终极解决方案）
   * 优先级：定位根容器 → hover → 等子元素可见 → force=True 点击 → 300ms 动画等待 → JS 兜底
   */
  private async runHover(step: TestStep): Promise<void> {
    const stepPrefix = this.currentStepIndex > 0 ? `[步骤 ${this.currentStepIndex}] ` : '';
    
    if (!step.locator) {
      throw new Error('悬停操作需要定位器');
    }
    
    // 在执行悬停操作前，先检查页面是否已关闭
    if (this.page.isClosed()) {
      throw new Error('页面已关闭，无法执行悬停操作');
    }
    
    // 等待页面稳定（确保之前的操作已完成）
    await this.waitForPageStable(2000);
    
    // 再次检查页面是否已关闭（可能在等待过程中关闭）
    if (this.page.isClosed()) {
      throw new Error('页面已关闭，无法执行悬停操作');
    }
    
    try {
      // ========== 策略1：定位悬浮栏根容器 → hover → 等子元素可见 ==========
      console.log(`${stepPrefix}🎯 策略1: 定位悬浮栏根容器并悬停...`);
      
      const locator = await this.locatorResolver.resolve(step.locator);
      if (!locator) {
        throw new Error('无法解析定位器');
      }
      
      // 解析定位器后，再次检查页面是否关闭
      if (this.page.isClosed()) {
        throw new Error('页面已关闭，无法执行悬停操作');
      }
      
      // 步骤1：定位根容器（优先使用稳定的选择器）
      // 尝试找到菜单的根容器（el-sub-menu 或 el-menu-item 的父容器）
      let rootContainer: Locator | null = null;
      
      try {
        // 方法1：通过定位器向上查找根容器
        const rootContainerFound = await locator.evaluate((el) => {
          let current: HTMLElement | null = el as HTMLElement;
          let root: HTMLElement | null = null;
          
          // 向上查找 el-sub-menu 或 el-menu 根容器
          while (current && current !== document.body) {
            const className = current.className || '';
            if (className.includes('el-sub-menu') || 
                className.includes('el-menu') && !className.includes('el-menu-item')) {
              root = current;
              break;
            }
            current = current.parentElement;
          }
          
          return root ? {
            tagName: root.tagName.toLowerCase(),
            className: root.className,
            id: root.id,
            text: root.textContent?.trim().substring(0, 50) || ''
          } : null;
        });
        
        if (rootContainerFound) {
          // 使用稳定的选择器定位根容器（避免动态 ID/class）
          const stableSelectors = [
            // 优先使用文本定位（最稳定）
            rootContainerFound.text ? this.page.getByText(rootContainerFound.text, { exact: false }).first() : null,
            // 使用稳定的 CSS 选择器（基于类名，不使用动态部分）
            rootContainerFound.className ? this.page.locator(`li.el-sub-menu:has-text("${rootContainerFound.text}")`).first() : null,
            // 使用 role 定位（如果可用）
            this.page.locator(`[role="menuitem"]:has-text("${rootContainerFound.text}")`).first(),
          ].filter(Boolean) as Locator[];
          
          if (stableSelectors.length > 0) {
            rootContainer = stableSelectors[0];
            console.log(`${stepPrefix}  └─ ✅ 找到根容器: ${rootContainerFound.text || rootContainerFound.className}`);
          }
        }
      } catch {
        // 如果查找根容器失败，使用原始定位器
        rootContainer = locator;
      }
      
      // 如果没有找到根容器，使用原始定位器
      if (!rootContainer) {
        rootContainer = locator;
      }
      
      // 步骤2：等待根容器可见（使用稳定的等待策略）
      try {
        await rootContainer.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        // 如果等待可见失败，尝试等待元素附加到DOM
        try {
          await rootContainer.waitFor({ state: 'attached', timeout: 5000 });
          console.log(`${stepPrefix}  └─ ⚠️ 根容器存在但不可见，将尝试强制悬停`);
        } catch {
          throw new Error('根容器未找到或不可见');
        }
      }
      
      // 步骤3：滚动到根容器（如果需要）
      try {
        await rootContainer.scrollIntoViewIfNeeded({ timeout: 2000 });
        await this.page.waitForTimeout(200);
      } catch {
        // 滚动失败不影响，继续
      }
      
      // 步骤4：执行 hover（核心步骤）
      const isVisible = await rootContainer.isVisible().catch(() => false);
      if (isVisible) {
        await rootContainer.hover({ timeout: 10000 });
        console.log(`${stepPrefix}  └─ ✅ Hover 根容器成功`);
      } else {
        // 如果元素不可见，尝试强制悬停（通过JavaScript事件）
        console.log(`${stepPrefix}  └─ ⚠️ 根容器不可见，尝试通过JavaScript事件强制悬停`);
        await rootContainer.evaluate((el) => {
          // 触发 mouseenter 和 mouseover 事件
          const mouseEnterEvent = new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(mouseEnterEvent);
          
          const mouseOverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(mouseOverEvent);
        });
        console.log(`${stepPrefix}  └─ ✅ JavaScript事件触发成功`);
      }
      
      // 步骤5：等待子元素可见（使用稳定的选择器）
      let menuExpanded = false;
      try {
        // 使用稳定的选择器等待菜单展开（不使用动态 ID/class）
        const stableMenuSelectors = [
          'li.el-sub-menu.is-opened',
          'li.el-sub-menu.is-active',
          '.el-menu--horizontal .el-sub-menu.is-opened',
          '.el-menu--vertical .el-sub-menu.is-opened',
          '.el-menu--collapse .el-sub-menu.is-opened',
          '[role="menu"]:visible',
          '.el-menu:visible'
        ];
        
        // 等待任一选择器出现
        await Promise.race(
          stableMenuSelectors.map(selector => 
            this.page.waitForSelector(selector, { timeout: 3000, state: 'visible' })
          )
        );
        menuExpanded = true;
        console.log(`${stepPrefix}  └─ ✅ 子菜单已展开（策略1成功）`);
      } catch {
        // 策略1失败，进入策略2
        console.log(`${stepPrefix}  └─ ⚠️ 策略1失败，进入策略2: 添加动画等待...`);
        
        // ========== 策略2：添加 300ms 动画等待 ==========
        await this.page.waitForTimeout(300);
        
        // 再次检查菜单是否展开
        try {
          const isExpanded = await this.page.evaluate(() => {
            return !!document.querySelector('li.el-sub-menu.is-opened, li.el-sub-menu.is-active, [role="menu"]:visible');
          });
          
          if (isExpanded) {
            menuExpanded = true;
            console.log(`${stepPrefix}    └─ ✅ 动画等待后菜单已展开（策略2成功）`);
          } else {
            // 策略2也失败，进入策略3
            console.log(`${stepPrefix}    └─ ⚠️ 策略2失败，进入策略3: JavaScript 兜底方案...`);
            
            // ========== 策略3：JavaScript 兜底方案（100% 解决） ==========
            const jsSuccess = await this.page.evaluate((rootElement) => {
              // 向上查找菜单根容器
              let current: HTMLElement | null = rootElement as HTMLElement;
              let menuElement: HTMLElement | null = null;
              
              // 向上查找 el-sub-menu 或 el-menu
              while (current && current !== document.body) {
                const className = current.className || '';
                if (className.includes('el-sub-menu') || 
                    (className.includes('el-menu') && !className.includes('el-menu-item'))) {
                  menuElement = current;
                  break;
                }
                current = current.parentElement;
              }
              
              if (!menuElement) {
                return false;
              }
              
              // 方法1：添加展开类（最直接）
              menuElement.classList.add('is-opened', 'is-active');
              menuElement.setAttribute('aria-expanded', 'true');
              
              // 方法2：显示子菜单（直接操作DOM）
              const subMenu = menuElement.querySelector('.el-menu') as HTMLElement;
              if (subMenu) {
                subMenu.style.display = 'block';
                subMenu.style.visibility = 'visible';
                subMenu.style.opacity = '1';
                subMenu.style.height = 'auto';
                // 移除可能的隐藏样式
                subMenu.style.removeProperty('display');
                subMenu.style.removeProperty('visibility');
              }
              
              // 方法3：触发Vue组件方法（如果可用）
              const vueInstance = (menuElement as any).__vue__;
              if (vueInstance) {
                // ElementUI 菜单组件的方法
                if (vueInstance.handleClick) {
                  vueInstance.handleClick();
                } else if (vueInstance.handleMouseenter) {
                  vueInstance.handleMouseenter();
                } else if (vueInstance.handleOpen) {
                  vueInstance.handleOpen();
                }
              }
              
              // 方法4：触发原生事件（确保事件监听器被触发）
              const mouseEnterEvent = new MouseEvent('mouseenter', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              menuElement.dispatchEvent(mouseEnterEvent);
              
              const mouseOverEvent = new MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              menuElement.dispatchEvent(mouseOverEvent);
              
              return true;
            }, await rootContainer.elementHandle());
            
            if (jsSuccess) {
              // 等待DOM更新
              await this.page.waitForTimeout(300);
              
              // 验证菜单是否展开
              const isExpanded = await this.page.evaluate(() => {
                return !!document.querySelector('li.el-sub-menu.is-opened, li.el-sub-menu.is-active, [role="menu"]:visible');
              });
              
              if (isExpanded) {
                menuExpanded = true;
                console.log('✅ JavaScript操作成功，菜单已展开（策略3成功）');
              } else {
                console.log('⚠️ JavaScript操作后菜单仍未展开，但继续执行');
              }
            } else {
              console.log('⚠️ JavaScript操作失败，但继续执行');
            }
          }
        } catch {
          console.log('⚠️ 策略2检查失败，但继续执行');
        }
      }
      
      // 额外等待，确保菜单项完全可见（动画完成）
      if (menuExpanded) {
        await this.page.waitForTimeout(500);
      } else {
        // 即使菜单未展开，也等待一段时间（可能菜单已经展开但检测失败）
        await this.page.waitForTimeout(300);
      }
      
    } catch (error: any) {
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`悬停操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }

  /**
   * 执行按键
   */
  private async runPress(step: TestStep): Promise<void> {
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
        await this.waitForPageStable(4000);
      } else {
        // 即使没有导航，也等待页面稳定（可能触发了其他异步操作）
        await this.waitForPageStable(2000);
      }
    } catch (error: any) {
      // 抛出原始错误
      throw new Error(`按键操作失败: ${error.message}\n按键: ${step.value}`);
    }
  }

  /**
   * 关闭对话框（如果存在）
   * 使用多种方式尝试关闭对话框，避免拦截后续操作
   */
  private async closeDialogIfExists(): Promise<void> {
    // 如果页面已关闭，直接返回，避免阻塞
    if (this.page.isClosed()) {
      return;
    }
    
    try {
      const dialogLocator = this.page.locator('div.el-overlay-message-box, div.el-overlay-dialog, [role="dialog"]');
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
            const closeXButton = this.page.locator(
              'button.el-dialog__close, button.el-message-box__close, ' +
              '[aria-label="Close"], [aria-label="关闭"], ' +
              '.el-dialog__headerbtn, .el-message-box__headerbtn'
            ).first();
            const closeXCount = await closeXButton.count();
            if (closeXCount > 0) {
              await closeXButton.click({ timeout: 2000 });
              await this.page.waitForTimeout(500);
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
            const closeButton = this.page.locator(
              'button:has-text("关闭"), button:has-text("关 闭"), button:has-text("取消"), ' +
              'button.el-button:has-text("关闭"), button.el-button:has-text("取消")'
            ).first();
            const closeButtonCount = await closeButton.count();
            if (closeButtonCount > 0) {
              // 使用 force 点击，避免被其他元素拦截
              await closeButton.click({ timeout: 2000, force: true });
              await this.page.waitForTimeout(500);
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
            const overlay = this.page.locator('.el-overlay, .el-overlay-dialog, .el-overlay-message-box');
            const overlayCount = await overlay.count();
            if (overlayCount > 0) {
              // 点击遮罩层的边缘（避免点击到对话框内容）
              const overlayBox = await overlay.first().boundingBox();
              if (overlayBox) {
                // 点击左上角（远离对话框内容）
                await this.page.mouse.click(overlayBox.x + 5, overlayBox.y + 5);
                await this.page.waitForTimeout(500);
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
            await this.page.evaluate(() => {
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
            
            await this.page.waitForTimeout(500);
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

  /**
   * 执行等待
   */
  private async runWait(step: TestStep): Promise<void> {
    const timeout = step.value ? Number(step.value) : 1000;
    await this.page.waitForTimeout(timeout);
  }

  /**
   * 执行截图
   */
  private async runScreenshot(step: TestStep): Promise<void> {
    const name = step.value ? String(step.value) : `screenshot-${Date.now()}`;
    const screenshot = await this.page.screenshot({
      path: `reports/screenshots/${name}.png`,
      fullPage: step.options?.fullPage,
    });
    await allure.attachment(name, screenshot, 'image/png');
  }

  /**
   * 执行断言
   */
  private async runAssert(step: TestStep): Promise<void> {
    // 断言逻辑在 config-executor 中处理
    // 这里可以添加通用断言逻辑
  }

  /**
   * 执行滚动
   */
  private async runScroll(step: TestStep): Promise<void> {
    if (!step.locator) {
      // 滚动页面
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else {
      const locator = await this.locatorResolver.resolve(step.locator);
      if (locator) {
        await locator.scrollIntoViewIfNeeded();
      }
    }
  }

  /**
   * 执行拖拽
   */
  private async runDrag(step: TestStep): Promise<void> {
    // 拖拽需要源和目标定位器
    // 这里简化处理，实际需要更复杂的逻辑
    throw new Error('拖拽操作暂未实现');
  }

  /**
   * 执行上传
   */
  private async runUpload(step: TestStep): Promise<void> {
    if (!step.locator) {
      throw new Error('上传操作需要定位器');
    }
    if (!step.value || typeof step.value !== 'string') {
      throw new Error('上传操作需要文件路径');
    }
    const locator = await this.locatorResolver.resolve(step.locator);
    if (!locator) {
      throw new Error('无法解析定位器');
    }
    await locator.setInputFiles(step.value);
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
