import { Page, expect, Locator } from '@playwright/test';
// 暂时禁用 Allure 报告生成（避免生成大量日志文件）
// 如需启用，取消下面的注释并注释掉空的 allure 对象
// import { allure } from 'allure-playwright';
import { readFileSync } from 'fs';
import type { TestConfig, TestStep, AssertionStep } from '../types/test-config';
import { StepRunner } from './step-runner';
import { getEnvironment } from '../config/environments';

// 创建空的 allure 对象，避免修改所有调用处
const allure = {
  epic: async (_value: string) => {},
  feature: async (_value: string) => {},
  description: async (_value: string) => {},
  tag: async (_value: string) => {},
  step: async (_name: string, fn: () => Promise<void>) => await fn(),
  attachment: async (_name: string, _content: any, _type?: string) => {},
};

/**
 * 配置执行器
 * 解析并执行测试配置
 */
export class ConfigExecutor {
  private stepRunner: StepRunner;
  private _page: Page;

  constructor(page: Page) {
    this._page = page;
    this.stepRunner = new StepRunner(page);
    // 监听 StepRunner 的页面更新事件
    (this.stepRunner as any).onPageUpdate = (newPage: Page) => {
      this.updatePage(newPage);
    };
  }

  /**
   * 获取当前页面对象
   */
  get page(): Page {
    return this._page;
  }

  /**
   * 更新页面对象（用于降级策略中创建新页面）
   */
  updatePage(newPage: Page): void {
    this._page = newPage;
    this.stepRunner.updatePage(newPage);
  }

  /**
   * 尝试恢复页面（如果页面关闭是由于导航导致的）
   * 返回 true 如果成功恢复，false 如果无法恢复
   */
  private async tryRecoverPageAfterNavigation(): Promise<boolean> {
    try {
      // 获取浏览器上下文
      const context = this.page.context();
      
      // 增加等待时间，让新页面有时间加载（最多等待10秒）
      console.log('⏳ 等待新页面加载...');
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 获取上下文中的所有页面
        const pages = context.pages();
        
        // 查找未关闭的页面
        const activePage = pages.find(p => !p.isClosed());
        
        if (activePage) {
          console.log(`✅ 检测到新页面（可能是导航导致的），已切换到新页面: ${activePage.url()}`);
          this.updatePage(activePage);
          
          // 等待新页面加载完成（增加超时时间）
          try {
            console.log('⏳ 等待新页面 DOM 加载完成...');
            await activePage.waitForLoadState('domcontentloaded', { timeout: 30000 });
            console.log('✅ DOM 已加载完成');
            
            // 尝试等待网络空闲，但不强制
            try {
              console.log('⏳ 等待新页面网络空闲...');
              await activePage.waitForLoadState('networkidle', { timeout: 30000 });
              console.log('✅ 网络已空闲');
            } catch {
              // 如果网络空闲超时，继续使用页面
              console.log('⚠️ 网络空闲等待超时，但继续使用新页面');
            }
            
            console.log(`✅ 新页面已加载完成: ${activePage.url()}`);
            return true;
          } catch (error) {
            // 即使等待失败，也继续使用新页面
            console.log(`⚠️ 新页面加载等待超时，但继续使用新页面: ${activePage.url()}`);
            return true; // 仍然返回 true，因为找到了新页面
          }
        }
        
        // 如果还没找到，继续等待
        if (attempt % 4 === 0) {
          console.log(`⏳ 仍在等待新页面加载... (${(attempt + 1) * 0.5}秒)`);
        }
      }
      
      console.log('⚠️ 等待超时，未找到新页面');
      return false;
    } catch (error: any) {
      // 如果无法恢复，返回 false
      console.log(`⚠️ 无法恢复页面: ${error.message}`);
      return false;
    }
  }

  /**
   * 从文件加载配置
   */
  static loadConfig(filePath: string): TestConfig {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as TestConfig;
  }

  /**
   * 执行测试配置
   */
  async execute(config: TestConfig): Promise<void> {
    await allure.epic(config.platform);
    await allure.feature(config.name);
    if (config.description) {
      await allure.description(config.description);
    }
    if (config.tags) {
      for (const tag of config.tags) {
        await allure.tag(tag);
      }
    }

    // 输出测试开始日志
    console.log(`\n🚀 开始执行测试: ${config.name}`);
    console.log(`📋 总步骤数: ${config.steps.length}`);
    if (config.startUrl) {
      console.log(`🌐 起始URL: ${config.startUrl}`);
    }
    console.log('─'.repeat(60));

    try {
      // 如果有起始URL，先导航到起始页面
      if (config.startUrl) {
        await allure.step(`导航到起始页面: ${config.startUrl}`, async () => {
          await this.page.goto(config.startUrl!, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
          // 等待页面稳定
          await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
            // 如果网络空闲超时，继续执行
          });
        });
      }

      // 执行前置步骤
      if (config.setup && config.setup.length > 0) {
        await allure.step('前置步骤', async () => {
          for (const step of config.setup!) {
            await this.stepRunner.run(step);
          }
        });
      }

      // 执行测试步骤
      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        
        // 智能跳过：如果上一步是点击或按键，且当前是导航，且页面已经导航到目标URL，则跳过
        const prevStep = i > 0 ? config.steps[i - 1] : null;
        if (prevStep && step.action === 'navigate' && 
            (prevStep.action === 'click' || prevStep.action === 'press')) {
          // 等待页面导航和加载完成（给登录等操作更多时间）
          try {
            // 等待 URL 变化或页面加载
            await Promise.race([
              this.page.waitForURL('**', { timeout: 5000 }),
              new Promise(resolve => setTimeout(resolve, 2000))
            ]);
            await this.page.waitForLoadState('networkidle', { timeout: 5000 });
          } catch {
            // 忽略超时，继续执行
          }
          
          const currentUrl = this.page.url();
          const targetUrl = step.value as string;
          
          // 比较时忽略 query 参数和 hash
          const normalizeUrl = (url: string) => {
            try {
              const u = new URL(url);
              return `${u.protocol}//${u.host}${u.pathname}`;
            } catch {
              return url.split('?')[0].split('#')[0];
            }
          };
          
          const normalizedCurrent = normalizeUrl(currentUrl);
          const normalizedTarget = normalizeUrl(targetUrl);
          
          // 如果当前URL已经匹配目标URL，跳过导航（避免覆盖登录状态）
          if (normalizedCurrent === normalizedTarget || 
              normalizedCurrent.includes(normalizedTarget) || 
              normalizedTarget.includes(normalizedCurrent)) {
            const actionType = prevStep.action === 'press' ? '按键' : '点击';
            console.log(`⏭️  跳过重复导航: 页面已在 ${currentUrl}，目标 ${targetUrl}（${actionType}操作已导致导航）`);
            continue;
          }
        }
        
        // 在执行步骤前，先检查页面是否已关闭
        // 注意：页面关闭可能是由于：
        // 1. 用户手动关闭浏览器窗口
        // 2. 某些操作导致页面导航到新页面（旧页面被关闭）
        // 3. 浏览器上下文被关闭
        if (this.page.isClosed()) {
          console.log(`⚠️ 检测到页面已关闭（可能由于导航），尝试恢复页面...`);
          
          // 尝试恢复页面（如果是导航导致的，会有新页面）
          const recovered = await this.tryRecoverPageAfterNavigation();
          
          if (!recovered) {
            // 如果无法恢复，跳过当前步骤
            console.log(`⚠️ 无法恢复页面，跳过步骤 ${i + 1}: ${step.description || step.action}`);
            continue; // 跳过当前步骤，继续下一个
          }
          
          // 如果成功恢复，继续执行当前步骤
          console.log(`✅ 页面已恢复，继续执行步骤 ${i + 1}: ${step.description || step.action}`);
        }
        
        // 等待页面稳定（确保上一步操作已完成）
        // 如果页面已关闭，直接跳过等待，避免阻塞
        if (this.page.isClosed()) {
          // 页面已关闭，跳过等待，直接执行步骤
        } else {
          try {
            await Promise.race([
              this.page.waitForLoadState('domcontentloaded', { timeout: 3000 }),
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
                }, 3500); // 最多等待3.5秒
              })
            ]).catch(() => {
              // 忽略超时，继续执行
            });
            // 额外等待一小段时间，确保动画和异步操作完成
            if (!this.page.isClosed()) {
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
              ]).catch(() => {
                // 如果等待失败，继续执行
              });
            }
          } catch {
            // 如果等待失败，继续执行（避免阻塞）
          }
        }
        
        await this.executeStep(step, i + 1);
        
        // 执行步骤后，等待页面稳定（确保操作已完成，页面已加载）
        if (!this.page.isClosed()) {
          try {
            // 等待网络空闲（最多3秒）
            await Promise.race([
              this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {
                // 如果网络空闲超时，至少等待 DOM 加载完成
                if (!this.page.isClosed()) {
                  return this.page.waitForLoadState('domcontentloaded', { timeout: 2000 });
                }
              }),
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
                }, 4000); // 最多等待4秒
              })
            ]).catch(() => {
              // 忽略错误，继续执行
            });
            // 额外等待一小段时间，确保动画和异步操作完成
            if (!this.page.isClosed()) {
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
              ]).catch(() => {
                // 如果等待失败，继续执行
              });
            }
          } catch {
            // 如果等待失败，至少等待一小段时间
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
                ]).catch(() => {
                  // 如果等待失败，继续执行
                });
              } catch {
                // 如果所有等待都失败，继续执行
              }
            }
          }
        }
        
        // 执行步骤后，检查页面是否关闭
        // 注意：某些操作（如导航、点击链接）可能导致页面关闭
        if (this.page.isClosed()) {
          console.log(`⚠️ 步骤 ${i + 1} (${step.description || step.action}) 执行后检测到页面已关闭（可能是正常导航），尝试恢复页面...`);
          
          // 尝试恢复页面（如果是导航导致的，会有新页面）
          const recovered = await this.tryRecoverPageAfterNavigation();
          
          if (recovered) {
            console.log(`✅ 页面已恢复，继续执行后续步骤`);
          } else {
            console.log(`⚠️ 无法恢复页面，后续步骤可能会失败`);
          }
        }
      }

      // 执行后置步骤
      if (config.teardown && config.teardown.length > 0) {
        await allure.step('后置步骤', async () => {
          for (const step of config.teardown!) {
            await this.stepRunner.run(step);
          }
        });
      }
      
      // 输出测试完成日志
      console.log('─'.repeat(60));
      console.log(`✅ 测试执行完成: ${config.name}`);
    } catch (error) {
      // 输出测试失败日志
      console.log('─'.repeat(60));
      console.log(`❌ 测试执行失败: ${config.name}`);
      console.log(`   错误: ${error instanceof Error ? error.message : String(error)}`);
      await allure.attachment('错误信息', String(error), 'text/plain');
      throw error;
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: TestStep, index: number): Promise<void> {
    const stepName = step.description || `${index}. ${step.action}`;
    
    // 获取操作类型的中文描述
    const actionTypeMap: Record<string, string> = {
      'click': '🖱️  点击',
      'fill': '⌨️  输入',
      'hover': '🖱️  悬停',
      'navigate': '🌐 导航',
      'keypress': '⌨️  按键',
      'select': '📋 选择',
      'check': '✅ 勾选',
      'uncheck': '❌ 取消勾选',
      'assert': '✅ 断言',
      'wait': '⏳ 等待',
      'scroll': '📜 滚动',
    };
    
    const actionIcon = actionTypeMap[step.action] || `🔧 ${step.action}`;
    
    // 构建步骤日志（包含额外信息）
    let stepLog = `[执行步骤 ${index}] ${actionIcon} ${stepName}`;
    
    // 如果是输入操作，显示输入的值
    if (step.action === 'fill' && step.value !== undefined) {
      const valueStr = typeof step.value === 'string' ? `"${step.value}"` : String(step.value);
      stepLog += `: ${valueStr}`;
    }
    
    // 如果是按键操作，显示按键的值
    if (step.action === 'press' && step.value !== undefined) {
      stepLog += `: ${step.value}`;
    }
    
    // 如果是导航操作，显示目标URL
    if (step.action === 'navigate' && step.value !== undefined) {
      stepLog += `: ${step.value}`;
    }
    
    // 如果是选择操作，显示选择的值
    if (step.action === 'select' && step.value !== undefined) {
      stepLog += `: ${step.value}`;
    }
    
    // 输出步骤开始日志
    console.log(stepLog);
    
    await allure.step(stepName, async () => {
      try {
        // 如果是断言步骤，特殊处理
        if (step.action === 'assert') {
          await this.executeAssertion(step as AssertionStep);
        } else {
          // 传递步骤索引和描述给 stepRunner
          await this.stepRunner.run(step, index, stepName);
        }
        
        // 输出步骤完成日志
        console.log(`[执行步骤 ${index}] ✅ 完成: ${stepName}`);
      } catch (error: any) {
        // 输出步骤失败日志
        console.log(`[执行步骤 ${index}] ❌ 失败: ${stepName} - ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * 执行断言
   */
  private async executeAssertion(step: AssertionStep): Promise<void> {
    if (!step.locator) {
      throw new Error('断言需要定位器');
    }

    const { LocatorResolver } = await import('./locator-resolver');
    const locatorResolver = new LocatorResolver(this.page);
    const locator = await locatorResolver.resolve(step.locator);

    if (!locator) {
      throw new Error('无法解析定位器');
    }

    switch (step.assertionType) {
      case 'visible':
        await expect(locator).toBeVisible();
        break;
      case 'hidden':
        await expect(locator).toBeHidden();
        break;
      case 'enabled':
        await expect(locator).toBeEnabled();
        break;
      case 'disabled':
        await expect(locator).toBeDisabled();
        break;
      case 'text':
        if (step.expectedValue === undefined) {
          throw new Error('文本断言需要期望值');
        }
        await expect(locator).toHaveText(String(step.expectedValue));
        break;
      case 'value':
        if (step.expectedValue === undefined) {
          throw new Error('值断言需要期望值');
        }
        await expect(locator).toHaveValue(String(step.expectedValue));
        break;
      case 'count':
        if (step.expectedValue === undefined) {
          throw new Error('数量断言需要期望值');
        }
        await expect(locator).toHaveCount(Number(step.expectedValue));
        break;
      case 'attribute':
        // 属性断言需要额外配置
        break;
      case 'url':
        await expect(this.page).toHaveURL(String(step.expectedValue || ''));
        break;
      case 'title':
        await expect(this.page).toHaveTitle(String(step.expectedValue || ''));
        break;
      default:
        throw new Error(`不支持的断言类型: ${step.assertionType}`);
    }
  }

  /**
   * 设置环境
   */
  async setEnvironment(envName?: string): Promise<void> {
    const env = getEnvironment(envName);
    if (env.webUrl) {
      await this.page.goto(env.webUrl);
    }
  }
}
