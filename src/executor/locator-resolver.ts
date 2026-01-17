import { Page, Locator } from '@playwright/test';
import type { LocatorConfig, LocatorStrategy } from '../types/test-config';
import { LocatorEngine } from '../core/locator-engine';

/**
 * 定位解析器（适配器模式）
 * 使用新的 LocatorEngine 作为核心引擎
 */
export class LocatorResolver {
  private engine: LocatorEngine;

  constructor(private page: Page) {
    this.engine = new LocatorEngine(page);
  }

  /**
   * 解析定位配置为 Locator
   * 委托给 LocatorEngine 处理
   */
  async resolve(locatorConfig: LocatorConfig): Promise<Locator | null> {
    try {
      return await this.engine.resolve(locatorConfig);
    } catch (error: any) {
      // 如果引擎解析失败，返回 null 让调用者处理
      console.error(`定位解析失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 更新页面引用
   */
  updatePage(newPage: Page): void {
    (this.page as any) = newPage;
    this.engine.updatePage(newPage);
  }

  /**
   * 旧版解析方法（保留兼容性，但已废弃）
   * @deprecated 使用 engine.resolve 代替
   */
  private async resolveLegacy(locatorConfig: LocatorConfig): Promise<Locator | null> {
    let strategies = locatorConfig.strategies || [];
    
    // 如果策略为空，尝试从描述中提取信息生成备选策略
    if (strategies.length === 0 && locatorConfig.description) {
      const desc = locatorConfig.description;
      // 尝试从描述中提取 tagName（如 "定位 svg 元素"）
      const tagMatch = desc.match(/定位\s+(\w+)\s+元素/);
      if (tagMatch) {
        const tagName = tagMatch[1];
        strategies = [
          { type: 'css', value: tagName, priority: 99 }
        ];
      }
    }
    
    // 根据历史成功率动态调整优先级（参考八爪鱼的历史成功率记录）
    strategies = strategies.map(strategy => {
      const basePriority = strategy.priority || 99;
      const adjustedPriority = locatorStats.adjustPriority(strategy, basePriority);
      return {
        ...strategy,
        priority: adjustedPriority,
      };
    });
    
    // 按调整后的优先级排序
    strategies = strategies.sort((a, b) => 
      (a.priority || 99) - (b.priority || 99)
    );
    
    // 对于对话框，优先使用 CSS 选择器（更稳定），而不是 role（name 可能包含按钮文本或过长）
    // 如果第一个策略是 role:dialog，尝试将 CSS 策略提前
    if (strategies.length > 1 && strategies[0].type === 'role' && strategies[0].value === 'dialog') {
      // 查找对话框相关的 CSS 策略
      const cssStrategy = strategies.find(s => 
        s.type === 'css' && s.value && 
        (s.value.includes('el-overlay-message-box') || s.value.includes('el-overlay-dialog'))
      );
      if (cssStrategy) {
        // 将 CSS 策略移到前面（但保持优先级顺序）
        const cssIndex = strategies.indexOf(cssStrategy);
        if (cssIndex > 0 && cssStrategy.priority && cssStrategy.priority <= 7) {
          // 如果 CSS 策略优先级合理，将其提前到第一个位置（role 之前）
          strategies.splice(cssIndex, 1);
          strategies.splice(0, 0, cssStrategy);
        }
      }
      // 如果 role name 过长（> 50 字符），跳过 role 策略
      if (strategies[0].name && strategies[0].name.length > 50) {
        console.log('⚠️ 对话框 role name 过长，跳过 role 策略，优先使用 CSS 选择器');
        strategies.shift(); // 移除第一个 role 策略
      }
    }

    const errors: string[] = [];

    for (const strategy of strategies) {
      try {
        // 检查页面是否已关闭
        if (this.page.isClosed()) {
          errors.push(`${strategy.type}:${strategy.value} - 页面已关闭`);
          // 如果页面已关闭，不再尝试后续策略
          break;
        }

        const locator = this.strategyToLocator(strategy);
        if (locator) {
          // 等待元素可见（最多等待10秒，给元素更多时间加载和动画完成）
          try {
            // 先检查元素数量（快速检查，不等待）
            const count = await locator.count().catch(() => 0);
            
            // 如果页面在检查过程中关闭，立即返回
            if (this.page.isClosed()) {
              errors.push(`${strategy.type}:${strategy.value} - 页面已关闭`);
              break;
            }
            
            // 如果 CSS 选择器匹配多个元素，需要特殊处理
            if (count > 1 && strategy.type === 'css') {
              // 对于对话框元素（div.el-overlay-dialog, div.el-overlay-message-box），
              // 应该选择可见的那个，而不是跳过
              const isDialogSelector = strategy.value.includes('el-overlay-dialog') || 
                                      strategy.value.includes('el-overlay-message-box');
              
              if (isDialogSelector) {
                // 对于对话框，选择可见的那个
                try {
                  const visibleLocator = locator.filter({ hasText: '' }).first(); // 先尝试第一个
                  const isVisible = await visibleLocator.isVisible().catch(() => false);
                  if (isVisible) {
                    // 如果第一个可见，使用它
                    console.log(`✅ 对话框选择器匹配到 ${count} 个元素，使用可见的第一个`);
                    return visibleLocator;
                  } else {
                    // 如果第一个不可见，尝试找到可见的那个
                    for (let i = 0; i < count; i++) {
                      const testLocator = locator.nth(i);
                      const testVisible = await testLocator.isVisible().catch(() => false);
                      if (testVisible) {
                        console.log(`✅ 对话框选择器匹配到 ${count} 个元素，使用可见的第 ${i + 1} 个`);
                        return testLocator;
                      }
                    }
                    // 如果都不可见，继续尝试下一个策略
                    errors.push(`${strategy.type}:${strategy.value} - 匹配到 ${count} 个元素，但都不可见`);
                    continue;
                  }
                } catch {
                  // 如果检查可见性失败，继续尝试下一个策略
                  errors.push(`${strategy.type}:${strategy.value} - 匹配到 ${count} 个元素，检查可见性失败`);
                  continue;
                }
              }
              
              // 对于非对话框元素，如果有后续策略，优先使用后续策略来精确定位
              // 这样可以避免选择错误的元素（比如多个 div.el-col 时，应该使用 xpath 来精确定位）
              const currentIdx = strategies.indexOf(strategy);
              // 检查是否还有后续策略（排除动态 ID 的 XPath 和长文本的 XPath）
              const hasValidNextStrategy = strategies.some((s, idx) => {
                if (idx <= currentIdx) return false;
                // 如果下一个策略是动态 ID 的 XPath，不算有效策略
                if (s.type === 'xpath' && s.value.includes('el-id-') && /\d+-\d+/.test(s.value)) {
                  return false;
                }
                // 如果下一个策略是包含长文本的 XPath（> 100 字符），不算有效策略
                if (s.type === 'xpath' && s.value.length > 100) {
                  return false;
                }
                return true;
              });
              
              if (hasValidNextStrategy) {
                // 如果有后续策略，跳过这个通用的 CSS 选择器，使用更精确的策略
                errors.push(`${strategy.type}:${strategy.value} - 匹配到 ${count} 个元素，跳过（尝试更精确的策略）`);
                continue;
              }
              
              // 如果没有后续策略，尝试找到可见的元素
              try {
                // 尝试找到可见的元素
                for (let i = 0; i < count; i++) {
                  const testLocator = locator.nth(i);
                  const testVisible = await testLocator.isVisible().catch(() => false);
                  if (testVisible) {
                    console.log(`✅ CSS 选择器匹配到 ${count} 个元素，使用可见的第 ${i + 1} 个`);
                    return testLocator;
                  }
                }
                
                // 如果没有找到可见的元素，使用第一个元素（即使不可见，也可以尝试 force hover）
                console.log(`⚠️ CSS 选择器匹配到 ${count} 个元素，但都不可见，使用第一个元素`);
              } catch {
                // 如果检查可见性失败，使用第一个元素
                console.log(`⚠️ CSS 选择器匹配到 ${count} 个元素，检查可见性失败，使用第一个元素`);
              }
            }
            
            // 对于 XPath 包含动态 ID 的情况，直接跳过（因为 ID 会变化）
            if (strategy.type === 'xpath' && strategy.value.includes('el-id-') && /\d+-\d+/.test(strategy.value)) {
              errors.push(`${strategy.type}:${strategy.value} - 动态 ID 不可靠，跳过`);
              continue;
            }
            
            // 对于包含过长文本的 XPath（> 100 字符），直接跳过（可能包含动态内容）
            if (strategy.type === 'xpath' && strategy.value.length > 100) {
              errors.push(`${strategy.type}:${strategy.value.substring(0, 50)}... - XPath 文本过长，可能包含动态内容，跳过`);
              continue;
            }
            
            // 对于对话框等动态元素，先等待它们出现
            if (strategy.type === 'role' && strategy.value === 'dialog') {
              // 等待对话框出现（可能需要更长时间）
              try {
                await this.page.waitForSelector('div.el-overlay-message-box, [role="dialog"]', { 
                  state: 'visible', 
                  timeout: 15000 
                }).catch(() => {
                  // 如果等待失败，继续尝试定位器
                });
              } catch {
                // 忽略错误，继续尝试定位器
              }
            }
            
            // 先尝试等待元素附加到 DOM（更宽松的等待）
            await locator.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {
              // 如果附加失败，继续尝试可见
            });
            
            // 等待元素可见（包含动画时间）
            // 对于对话框，给更多时间等待动画完成
            const visibilityTimeout = (strategy.type === 'role' && strategy.value === 'dialog') ? 15000 : 10000;
            
            // 先尝试等待可见
            let isVisible = false;
            try {
              await locator.first().waitFor({ state: 'visible', timeout: visibilityTimeout });
              isVisible = true;
            } catch {
              // 如果等待可见失败，尝试滚动到元素位置（可能元素在视口外）
              try {
                await locator.first().scrollIntoViewIfNeeded({ timeout: 3000 });
                // 滚动后再次等待可见
                await locator.first().waitFor({ state: 'visible', timeout: 3000 });
                isVisible = true;
              } catch {
                // 如果滚动后仍然不可见，检查元素是否在 DOM 中但被隐藏
                const isAttached = await locator.first().evaluate((el) => {
                  return el.isConnected;
                }).catch(() => false);
                
                if (isAttached) {
                  // 元素在 DOM 中但不可见，可能是被 CSS 隐藏或需要展开父菜单
                  // 尝试检查父元素是否可展开
                  const parentExpandable = await locator.first().evaluate((el) => {
                    let current = el.parentElement;
                    while (current) {
                      // 检查是否是菜单项或可展开元素
                      if (current.classList.contains('el-sub-menu') || 
                          current.classList.contains('el-menu-item') ||
                          current.getAttribute('aria-expanded') === 'false') {
                        return true;
                      }
                      current = current.parentElement;
                    }
                    return false;
                  }).catch(() => false);
                  
                  if (parentExpandable) {
                    // 如果父元素可展开，尝试展开父菜单
                    console.log('⚠️ 检测到元素在折叠的父菜单中，尝试展开父菜单...');
                    try {
                      // 先尝试找到父菜单项
                      const parentInfo = await locator.first().evaluate((el) => {
                        let current = el.parentElement;
                        while (current) {
                          // 检查是否是菜单项或可展开元素
                          if (current.classList.contains('el-sub-menu') || 
                              current.classList.contains('el-menu-item') ||
                              current.getAttribute('aria-expanded') === 'false') {
                            // 查找展开按钮或菜单标题
                            const trigger = current.querySelector('.el-sub-menu__title') || 
                                          current.querySelector('.el-menu-item') ||
                                          current.querySelector('[role="menuitem"]') ||
                                          current;
                            if (trigger) {
                              return {
                                found: true,
                                tagName: trigger.tagName.toLowerCase(),
                                className: trigger.className,
                                text: trigger.textContent?.trim() || ''
                              };
                            }
                          }
                          current = current.parentElement;
                        }
                        return { found: false };
                      });
                      
                      if (parentInfo.found) {
                        // 先尝试 hover 父菜单项（某些菜单需要 hover 才会显示子菜单）
                        // 方法1: 使用 Playwright 的 hover 方法（如果能够定位到父元素）
                        try {
                          // 尝试通过文本定位父菜单项
                          if (parentInfo.text) {
                            const parentTextLocator = this.page.getByText(parentInfo.text, { exact: false }).first();
                            await parentTextLocator.hover({ timeout: 2000 });
                            await this.page.waitForTimeout(300);
                            console.log('✅ 已 hover 父菜单项（通过文本）');
                          }
                        } catch {
                          // 如果 Playwright hover 失败，尝试浏览器端事件
                          try {
                            await locator.first().evaluate((el) => {
                              let current = el.parentElement;
                              while (current) {
                                if (current.classList.contains('el-sub-menu') || 
                                    current.classList.contains('el-menu-item')) {
                                  const trigger = current.querySelector('.el-sub-menu__title') || 
                                                current.querySelector('.el-menu-item') ||
                                                current.querySelector('[role="menuitem"]') ||
                                                current;
                                  if (trigger) {
                                    // 触发 hover 事件
                                    const mouseEnterEvent = new MouseEvent('mouseenter', {
                                      bubbles: true,
                                      cancelable: true,
                                      view: window
                                    });
                                    trigger.dispatchEvent(mouseEnterEvent);
                                    
                                    // 也触发 mouseover 事件（某些框架需要）
                                    const mouseOverEvent = new MouseEvent('mouseover', {
                                      bubbles: true,
                                      cancelable: true,
                                      view: window
                                    });
                                    trigger.dispatchEvent(mouseOverEvent);
                                    return true;
                                  }
                                }
                                current = current.parentElement;
                              }
                              return false;
                            });
                            await this.page.waitForTimeout(300);
                            console.log('✅ 已 hover 父菜单项（通过事件）');
                          } catch {
                            console.log('⚠️ Hover 父菜单项失败，继续尝试点击');
                          }
                        }
                        
                        // 然后尝试点击展开按钮（如果需要）
                        const parentClicked = await locator.first().evaluate((el) => {
                          let current = el.parentElement;
                          while (current) {
                            if (current.classList.contains('el-sub-menu') || 
                                current.getAttribute('aria-expanded') === 'false') {
                              const trigger = current.querySelector('.el-sub-menu__title') || 
                                            current.querySelector('[role="menuitem"]') ||
                                            current;
                              if (trigger) {
                                (trigger as HTMLElement).click();
                                return true;
                              }
                            }
                            current = current.parentElement;
                          }
                          return false;
                        });
                        
                        // 等待菜单展开或显示
                        await this.page.waitForTimeout(500);
                        
                        // 再次尝试等待元素可见
                        try {
                          await locator.first().waitFor({ state: 'visible', timeout: 5000 });
                          isVisible = true;
                          console.log('✅ 已展开/显示父菜单，元素现在可见');
                        } catch {
                          // 如果仍然不可见，继续尝试其他策略
                          errors.push(`${strategy.type}:${strategy.value} - 展开父菜单后元素仍不可见`);
                        }
                      } else {
                        errors.push(`${strategy.type}:${strategy.value} - 元素存在但被隐藏，无法找到父菜单项`);
                        continue;
                      }
                    } catch (expandError: any) {
                      errors.push(`${strategy.type}:${strategy.value} - 元素存在但被隐藏，展开父菜单失败: ${expandError.message}`);
                      continue;
                    }
                  } else {
                    // 元素存在但不可见，记录错误但继续尝试其他策略
                    errors.push(`${strategy.type}:${strategy.value} - 元素存在但不可见（可能是 hidden 状态）`);
                    // 不 continue，继续尝试其他策略，或者如果这是最后一个策略，返回这个定位器（可以尝试 force 点击）
                  }
                } else {
                  errors.push(`${strategy.type}:${strategy.value} - 元素未找到`);
                  continue;
                }
              }
            }
            
            // 如果元素可见，等待一小段时间确保动画完成
            if (isVisible) {
              await this.page.waitForTimeout(300);
            }
            
            // 验证定位器是否有效
            const finalCount = await locator.count();
            if (finalCount > 0) {
              // 如果匹配多个元素，使用更精确的选择
              let targetLocator: Locator;
              if (finalCount > 1 && strategy.type === 'css') {
                // 对于 CSS 选择器，如果有多个匹配，尝试使用 XPath 或其他精确策略
                // 但这里我们已经检查过了，如果还有更精确的策略，应该已经跳过了
                // 所以这里使用 first() 是安全的
                targetLocator = locator.first();
              } else {
                targetLocator = locator.first();
              }
              
              // 检查元素是否可见，如果不可见但存在，仍然返回（可以尝试 force 点击）
              const isVisible = await targetLocator.isVisible().catch(() => false);
              if (isVisible) {
                // 成功定位，记录统计信息（参考八爪鱼的历史成功率记录）
                locatorStats.recordSuccess(strategy);
                return targetLocator;
              } else {
                // 元素存在但不可见，检查是否在 DOM 中
                const isAttached = await targetLocator.evaluate((el) => {
                  return el.isConnected;
                }).catch(() => false);
                
                if (isAttached) {
                  // 元素在 DOM 中但不可见，仍然返回定位器（可以在点击时使用 force）
                  console.log(`⚠️ 元素存在但不可见，将尝试强制点击: ${strategy.type}:${strategy.value}`);
                  // 记录成功（虽然不可见，但元素存在，可以尝试 force 点击）
                  locatorStats.recordSuccess(strategy);
                  return targetLocator;
                }
              }
            }
          } catch (waitError: any) {
            // 如果等待失败，记录错误但继续尝试下一个策略
            const errorMsg = waitError.message || '元素不可见或不存在';
            errors.push(`${strategy.type}:${strategy.value} - ${errorMsg}`);
            // 记录失败统计（参考八爪鱼的历史成功率记录）
            locatorStats.recordFailure(strategy);
            continue;
          }
        }
      } catch (error: any) {
        // 定位失败，记录错误并尝试下一个策略
        const errorMsg = error.message || '未知错误';
        errors.push(`${strategy.type}:${strategy.value} - ${errorMsg}`);
        // 记录失败统计（参考八爪鱼的历史成功率记录）
        locatorStats.recordFailure(strategy);
        continue;
      }
    }

    // 所有策略都失败，提供详细的错误信息
    const errorMsg = `无法定位元素，已尝试所有策略:\n${errors.join('\n')}\n配置: ${JSON.stringify(locatorConfig, null, 2)}`;
    throw new Error(errorMsg);
  }

  /**
   * 将定位策略转换为 Locator
   */
  private strategyToLocator(strategy: LocatorStrategy): Locator | null {
    switch (strategy.type) {
      case 'testid':
        return this.page.getByTestId(strategy.value);

      case 'id':
        return this.page.locator(`#${strategy.value}`);

      case 'role':
        if (strategy.name) {
          // 对于 dialog，name 参数可能包含太多文本（包括按钮文本）
          // 尝试精确匹配，如果失败则尝试部分匹配
          if (strategy.value === 'dialog') {
            // 先尝试精确匹配
            const exactLocator = this.page.getByRole('dialog', { name: strategy.name });
            // 如果 name 包含按钮文本（如"取消确定"），尝试只匹配主要内容
            // 移除按钮文本和多余的引号
            let nameWithoutButtons = strategy.name
              .replace(/取消确定.*$/, '')
              .replace(/确定.*$/, '')
              .replace(/取消.*$/, '')
              .trim();
            
            // 如果清理后的名称仍然有效且不同，使用正则表达式匹配
            if (nameWithoutButtons && nameWithoutButtons !== strategy.name && nameWithoutButtons.length > 5) {
              // 转义特殊字符并创建正则表达式
              const escapedName = nameWithoutButtons.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              try {
                const partialLocator = this.page.getByRole('dialog', { 
                  name: new RegExp(escapedName, 'i') 
                });
                // 返回精确匹配或部分匹配
                return exactLocator.or(partialLocator);
              } catch {
                // 如果正则表达式失败，只返回精确匹配
                return exactLocator;
              }
            }
            return exactLocator;
          }
          return this.page.getByRole(strategy.value as any, { name: strategy.name });
        }
        return this.page.getByRole(strategy.value as any);

      case 'name':
        return this.page.getByRole('textbox', { name: strategy.value })
          .or(this.page.locator(`[name="${strategy.value}"]`));

      case 'placeholder':
        // 使用 getByPlaceholder，如果失败则尝试 CSS 选择器
        return this.page.getByPlaceholder(strategy.value)
          .or(this.page.locator(`[placeholder="${strategy.value}"]`));

      case 'text':
        // 对于文本定位，尝试精确匹配，如果失败则使用包含匹配
        return this.page.getByText(strategy.value, { exact: true })
          .or(this.page.getByText(strategy.value));

      case 'css':
        return this.page.locator(strategy.value);

      case 'xpath':
        // Playwright 支持 XPath，但需要特殊语法
        // 如果 XPath 包含动态 ID（el-id-XXXX-XX），可能已经失效，返回 null 让系统尝试其他策略
        if (strategy.value.includes('el-id-') && /\d+-\d+/.test(strategy.value)) {
          // 动态 ID 的 XPath 不可靠，返回 null 让系统尝试其他策略
          return null;
        }
        return this.page.locator(`xpath=${strategy.value}`);

      default:
        return null;
    }
  }

  /**
   * 尝试解析定位器（带超时）
   */
  async resolveWithTimeout(
    locatorConfig: LocatorConfig,
    timeout: number = 10000
  ): Promise<Locator> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startTime < timeout) {
      try {
        const locator = await this.resolve(locatorConfig);
        if (locator) {
          return locator;
        }
      } catch (error) {
        lastError = error as Error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw lastError || new Error('定位超时');
  }

  /**
   * 验证定位器是否存在
   */
  async exists(locatorConfig: LocatorConfig): Promise<boolean> {
    try {
      const locator = await this.resolve(locatorConfig);
      if (locator) {
        const count = await locator.count();
        return count > 0;
      }
      return false;
    } catch {
      return false;
    }
  }
}
