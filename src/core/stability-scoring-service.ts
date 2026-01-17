import type { LocatorStrategy } from '../types/test-config';
import { locatorStats } from '../utils/locator-stats';

/**
 * 稳定性评分服务（参考八爪鱼的元素稳定性评分）
 * 评估每个定位策略的稳定性，动态调整优先级
 */
export class StabilityScoringService {
  /**
   * 根据历史成功率调整策略优先级
   */
  adjustPriorities(strategies: LocatorStrategy[]): LocatorStrategy[] {
    return strategies.map(strategy => {
      const basePriority = strategy.priority || 99;
      const adjustedPriority = locatorStats.adjustPriority(strategy, basePriority);
      return {
        ...strategy,
        priority: adjustedPriority,
      };
    });
  }

  /**
   * 记录定位成功
   */
  recordSuccess(strategy: LocatorStrategy): void {
    locatorStats.recordSuccess(strategy);
  }

  /**
   * 记录定位失败
   */
  recordFailure(strategy: LocatorStrategy): void {
    locatorStats.recordFailure(strategy);
  }

  /**
   * 计算策略的稳定性分数
   * 基于策略类型和属性值评估稳定性
   */
  calculateStabilityScore(strategy: LocatorStrategy): number {
    let score = 0;
    
    // 基础分数（基于策略类型）
    switch (strategy.type) {
      case 'testid':
        score = 10;
        break;
      case 'id':
        // 检查是否是动态 ID
        if (strategy.value && /el-id-\d+-\d+/.test(strategy.value)) {
          score = 0; // 动态 ID 不稳定
        } else {
          score = 8;
        }
        break;
      case 'name':
      case 'placeholder':
        score = 7;
        break;
      case 'role':
        score = 5;
        break;
      case 'text':
        // 文本可能变化，但短文本相对稳定
        if (strategy.value && strategy.value.length < 20) {
          score = 6;
        } else {
          score = 3;
        }
        break;
      case 'css':
        // CSS 选择器的稳定性取决于选择器的复杂度
        if (strategy.value && strategy.value.includes(':has-text(')) {
          score = 6.5; // 带文本的 CSS 相对稳定
        } else if (strategy.value && strategy.value.includes('el-id-')) {
          score = 0; // 包含动态 ID 的 CSS 不稳定
        } else {
          score = 7;
        }
        break;
      case 'xpath':
        // XPath 的稳定性取决于是否使用属性
        if (strategy.value && strategy.value.includes('@id=') && !strategy.value.includes('el-id-')) {
          score = 6.8; // 基于静态 ID 的 XPath
        } else if (strategy.value && strategy.value.includes('@name=')) {
          score = 6.8; // 基于 name 的 XPath
        } else if (strategy.value && strategy.value.includes('el-id-')) {
          score = 0; // 包含动态 ID 的 XPath 不稳定
        } else {
          score = 6.8; // 其他 XPath
        }
        break;
      default:
        score = 5;
    }
    
    // 根据历史成功率调整分数
    const stats = locatorStats.getStats(strategy);
    if (stats && stats.totalAttempts > 0) {
      const successRate = stats.successCount / stats.totalAttempts;
      // 成功率越高，分数越高（最多+2分）
      score += successRate * 2;
    }
    
    return Math.min(score, 10); // 最高10分
  }

  /**
   * 获取所有策略的稳定性排名
   */
  rankStrategies(strategies: LocatorStrategy[]): LocatorStrategy[] {
    return strategies
      .map(strategy => ({
        strategy,
        score: this.calculateStabilityScore(strategy)
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.strategy);
  }
}
