import { Page, Locator } from '@playwright/test';
import type { LocatorConfig, LocatorStrategy } from '../types/test-config';
import { ElementFingerprintService } from './element-fingerprint-service';
import { StabilityScoringService } from './stability-scoring-service';
import { SmartRetry } from './smart-retry';

/**
 * 核心定位引擎（参考八爪鱼架构）
 * 统一管理所有定位策略，提供智能定位和重试机制
 */
export class LocatorEngine {
  private stabilityService: StabilityScoringService;
  private retry: SmartRetry;

  constructor(private page: Page) {
    this.stabilityService = new StabilityScoringService();
    this.retry = new SmartRetry();
  }

  /**
   * 解析定位配置为 Locator（核心方法）
   * 按照八爪鱼的多策略Fallback机制，依次尝试直到成功
   */
  async resolve(locatorConfig: LocatorConfig): Promise<Locator> {
    let strategies = locatorConfig.strategies || [];
    
    // 如果策略为空，尝试从描述中提取信息生成备选策略
    if (strategies.length === 0 && locatorConfig.description) {
      strategies = this.generateStrategiesFromDescription(locatorConfig.description);
    }
    
    // 根据历史成功率动态调整优先级
    strategies = this.stabilityService.adjustPriorities(strategies);
    
    // 按调整后的优先级排序
    strategies = strategies.sort((a, b) => 
      (a.priority || 99) - (b.priority || 99)
    );
    
    // 使用智能重试机制，依次尝试每个策略
    const errors: string[] = [];
    
    for (const strategy of strategies) {
      try {
        // 检查页面是否已关闭
        if (this.page.isClosed()) {
          errors.push(`${strategy.type}:${strategy.value} - 页面已关闭`);
          break;
        }

        const locator = this.strategyToLocator(strategy);
        if (!locator) {
          errors.push(`${strategy.type}:${strategy.value} - 无法创建定位器`);
          continue;
        }

        // 使用智能重试机制验证定位器
        let finalLocator = locator;
        
        const isValid = await this.retry.execute(async () => {
          const count = await locator.count();
          if (count === 0) {
            throw new Error('元素未找到');
          }
          
          // 对于多个匹配的元素，需要特殊处理
          if (count > 1) {
            // 检查是否是对话框元素（应该选择可见的那个）
            const isDialogSelector = strategy.type === 'css' && (
              strategy.value.includes('el-overlay-dialog') || 
              strategy.value.includes('el-overlay-message-box')
            );
            
            if (isDialogSelector) {
              // 对于对话框，选择可见的那个
              for (let i = 0; i < count; i++) {
                const testLocator = locator.nth(i);
                const isVisible = await testLocator.isVisible().catch(() => false);
                if (isVisible) {
                  finalLocator = testLocator;
                  return true;
                }
              }
              throw new Error(`找到 ${count} 个对话框元素，但都不可见`);
            } else {
              // 对于其他元素，如果匹配多个，使用第一个（Playwright 的 strict mode 会处理）
              // 但我们需要确保返回的是单个元素的定位器
              finalLocator = locator.first();
              const isVisible = await finalLocator.isVisible().catch(() => false);
              if (!isVisible && strategy.type !== 'placeholder' && strategy.type !== 'name') {
                // 对于 placeholder 和 name，即使不可见也允许（可能是隐藏的输入框）
                throw new Error(`找到 ${count} 个元素，但第一个不可见`);
              }
            }
          }
          
          return true;
        }, {
          maxRetries: 2,
          timeout: 5000,
          retryDelay: 200
        });

        if (isValid) {
          // 记录成功
          this.stabilityService.recordSuccess(strategy);
          return finalLocator;
        }
      } catch (error: any) {
        errors.push(`${strategy.type}:${strategy.value} - ${error.message}`);
        // 记录失败
        this.stabilityService.recordFailure(strategy);
        continue;
      }
    }

    // 所有策略都失败
    throw new Error(
      `无法定位元素，已尝试所有策略:\n${errors.join('\n')}\n配置: ${JSON.stringify(locatorConfig, null, 2)}`
    );
  }

  /**
   * 将策略转换为 Playwright Locator
   */
  private strategyToLocator(strategy: LocatorStrategy): Locator | null {
    switch (strategy.type) {
      case 'testid':
        return this.page.getByTestId(strategy.value);

      case 'id':
        return this.page.locator(`#${strategy.value}`);

      case 'role':
        if (strategy.name) {
          // 对于 dialog，name 参数可能包含太多文本
          if (strategy.value === 'dialog') {
            const exactLocator = this.page.getByRole('dialog', { name: strategy.name });
            // 尝试清理 name（移除按钮文本）
            let nameWithoutButtons = strategy.name
              .replace(/取消确定.*$/, '')
              .replace(/确定.*$/, '')
              .replace(/取消.*$/, '')
              .trim();
            
            if (nameWithoutButtons && nameWithoutButtons !== strategy.name && nameWithoutButtons.length > 5) {
              const escapedName = nameWithoutButtons.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              try {
                const partialLocator = this.page.getByRole('dialog', { 
                  name: new RegExp(escapedName, 'i') 
                });
                return exactLocator.or(partialLocator);
              } catch {
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
        return this.page.getByPlaceholder(strategy.value)
          .or(this.page.locator(`[placeholder="${strategy.value}"]`));

      case 'text':
        // 尝试精确匹配，如果失败则使用包含匹配
        return this.page.getByText(strategy.value, { exact: true })
          .or(this.page.getByText(strategy.value));

      case 'css':
        return this.page.locator(strategy.value);

      case 'xpath':
        // 检查是否是动态 ID
        if (strategy.value.includes('el-id-') && /\d+-\d+/.test(strategy.value)) {
          return null; // 动态 ID 的 XPath 不可靠
        }
        return this.page.locator(`xpath=${strategy.value}`);

      default:
        return null;
    }
  }

  /**
   * 从描述中生成备选策略
   */
  private generateStrategiesFromDescription(description: string): LocatorStrategy[] {
    const strategies: LocatorStrategy[] = [];
    
    // 尝试从描述中提取 tagName（如 "定位 svg 元素"）
    const tagMatch = description.match(/定位\s+(\w+)\s+元素/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      strategies.push({
        type: 'css',
        value: tagName,
        priority: 99
      });
    }
    
    return strategies;
  }

  /**
   * 更新页面引用（用于页面导航后）
   */
  updatePage(newPage: Page): void {
    (this.page as any) = newPage;
  }
}
