import { Page } from '@playwright/test';

/**
 * 页面稳定性服务
 * 负责监控页面加载状态，提供智能等待功能
 */
export class PageStabilityService {
  private pendingRequests: Set<string> = new Set();
  private isMonitoringNetwork = false;
  private _page: Page;

  constructor(page: Page) {
    this._page = page;
    this.startNetworkMonitoring();
  }

  /**
   * 更新页面对象
   */
  updatePage(newPage: Page): void {
    this._page = newPage;
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
    this._page.on('request', (request) => {
      const url = request.url();
      // 只监控重要的请求（排除静态资源）
      if (!url.match(/\.(jpg|jpeg|png|gif|svg|ico|css|woff|woff2|ttf|eot)$/i)) {
        this.pendingRequests.add(url);
      }
    });

    // 监听请求完成
    this._page.on('response', (response) => {
      const url = response.url();
      this.pendingRequests.delete(url);
    });

    // 监听请求失败
    this._page.on('requestfailed', (request) => {
      const url = request.url();
      this.pendingRequests.delete(url);
    });
  }

  /**
   * 检查页面是否正在加载
   */
  private async isPageLoading(): Promise<boolean> {
    // 如果页面已关闭，返回 false（不再加载）
    if (this._page.isClosed()) {
      return false;
    }
    
    // 检查是否有待处理的网络请求
    if (this.pendingRequests.size > 0) {
      return true;
    }

    // 检查页面加载状态
    try {
      const isLoading = await this._page.evaluate(() => {
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
  async waitForPageStable(maxWaitTime: number = 5000): Promise<void> {
    // 如果页面已关闭，直接返回
    if (this._page.isClosed()) {
      return;
    }
    
    // 首先等待 DOM 加载完成
    try {
      await this._page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {
      // 如果超时，继续执行
    }
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 每次循环都检查页面是否关闭
      if (this._page.isClosed()) {
        return;
      }
      
      const isLoading = await this.isPageLoading();
      
      if (!isLoading) {
        // 页面似乎已经稳定，再等待一小段时间确保完全稳定
        // 增加等待时间，确保动画和异步操作完成
        // 使用 Promise.race 避免在页面关闭时无限等待
        if (!this._page.isClosed()) {
          try {
            await Promise.race([
              this._page.waitForTimeout(800),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this._page.isClosed()) {
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
      if (!this._page.isClosed()) {
        try {
          await Promise.race([
            this._page.waitForTimeout(500),
            new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (this._page.isClosed()) {
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
    if (!this._page.isClosed()) {
      try {
        await this._page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {
          // 如果网络空闲超时，至少等待 DOM 加载完成
          if (!this._page.isClosed()) {
            return this._page.waitForLoadState('domcontentloaded', { timeout: 2000 });
          }
        });
        // 网络空闲后，再等待一小段时间确保完全稳定
        if (!this._page.isClosed()) {
          try {
            await Promise.race([
              this._page.waitForTimeout(500),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this._page.isClosed()) {
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
        if (!this._page.isClosed()) {
          try {
            await Promise.race([
              this._page.waitForTimeout(500),
              new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (this._page.isClosed()) {
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
}