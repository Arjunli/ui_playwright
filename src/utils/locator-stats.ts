/**
 * 定位策略统计工具
 * 记录每个定位策略的成功率，动态调整优先级
 * 参考八爪鱼的历史成功率记录机制
 */

import type { LocatorStrategy } from '../types/test-config';

interface StrategyStats {
  strategy: string; // 策略标识，如 "testid:xxx" 或 "css:div.button"
  successCount: number;
  failureCount: number;
  lastUsed: number; // 时间戳
}

class LocatorStats {
  private stats: Map<string, StrategyStats> = new Map();
  private readonly maxStats = 1000; // 最多保存1000条统计

  /**
   * 记录策略成功
   */
  recordSuccess(strategy: LocatorStrategy): void {
    const key = this.getStrategyKey(strategy);
    const existing = this.stats.get(key) || {
      strategy: key,
      successCount: 0,
      failureCount: 0,
      lastUsed: Date.now(),
    };
    
    existing.successCount++;
    existing.lastUsed = Date.now();
    this.stats.set(key, existing);
    
    // 如果统计过多，清理旧的
    if (this.stats.size > this.maxStats) {
      this.cleanupOldStats();
    }
  }

  /**
   * 记录策略失败
   */
  recordFailure(strategy: LocatorStrategy): void {
    const key = this.getStrategyKey(strategy);
    const existing = this.stats.get(key) || {
      strategy: key,
      successCount: 0,
      failureCount: 0,
      lastUsed: Date.now(),
    };
    
    existing.failureCount++;
    existing.lastUsed = Date.now();
    this.stats.set(key, existing);
  }

  /**
   * 获取策略的成功率
   */
  getSuccessRate(strategy: LocatorStrategy): number {
    const key = this.getStrategyKey(strategy);
    const stats = this.stats.get(key);
    if (!stats) {
      return 0.5; // 默认50%成功率（未知策略）
    }
    
    const total = stats.successCount + stats.failureCount;
    if (total === 0) {
      return 0.5;
    }
    
    return stats.successCount / total;
  }

  /**
   * 调整策略优先级（基于历史成功率）
   * 返回调整后的优先级（0-10，越高越优先）
   */
  adjustPriority(strategy: LocatorStrategy, basePriority: number): number {
    const successRate = this.getSuccessRate(strategy);
    const key = this.getStrategyKey(strategy);
    const stats = this.stats.get(key);
    
    // 如果策略使用次数太少（< 5次），不调整优先级
    if (!stats || (stats.successCount + stats.failureCount) < 5) {
      return basePriority;
    }
    
    // 根据成功率调整优先级
    // 成功率 > 0.9: +2
    // 成功率 > 0.7: +1
    // 成功率 < 0.3: -2
    // 成功率 < 0.5: -1
    let adjustment = 0;
    if (successRate > 0.9) {
      adjustment = 2;
    } else if (successRate > 0.7) {
      adjustment = 1;
    } else if (successRate < 0.3) {
      adjustment = -2;
    } else if (successRate < 0.5) {
      adjustment = -1;
    }
    
    // 限制优先级范围（1-99）
    const adjustedPriority = Math.max(1, Math.min(99, basePriority + adjustment));
    
    return adjustedPriority;
  }

  /**
   * 获取策略标识
   */
  private getStrategyKey(strategy: LocatorStrategy): string {
    const parts = [strategy.type, strategy.value];
    if (strategy.name) {
      parts.push(strategy.name);
    }
    return parts.join(':');
  }

  /**
   * 清理旧的统计（保留最近使用的）
   */
  private cleanupOldStats(): void {
    const entries = Array.from(this.stats.entries());
    // 按最后使用时间排序，保留最近使用的
    entries.sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    
    // 只保留前 maxStats 条
    this.stats.clear();
    entries.slice(0, this.maxStats).forEach(([key, value]) => {
      this.stats.set(key, value);
    });
  }

  /**
   * 获取所有统计信息（用于调试）
   */
  getAllStats(): StrategyStats[] {
    return Array.from(this.stats.values()).sort((a, b) => {
      const rateA = a.successCount / (a.successCount + a.failureCount || 1);
      const rateB = b.successCount / (b.successCount + b.failureCount || 1);
      return rateB - rateA;
    });
  }

  /**
   * 清空所有统计
   */
  clear(): void {
    this.stats.clear();
  }
}

// 单例模式
export const locatorStats = new LocatorStats();
