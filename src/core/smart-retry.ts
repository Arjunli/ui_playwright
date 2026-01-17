/**
 * 智能重试机制（参考八爪鱼的智能重试和容错）
 * 支持自动重试、降级策略和模糊匹配
 */
export interface RetryOptions {
  maxRetries?: number;
  timeout?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
}

export class SmartRetry {
  /**
   * 执行带重试的操作
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      timeout = 10000,
      retryDelay = 200,
      exponentialBackoff = true
    } = options;

    let lastError: Error | null = null;
    let delay = retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 如果设置了超时，使用 Promise.race
        if (timeout > 0) {
          return await Promise.race([
            fn(),
            new Promise<T>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`操作超时（${timeout}ms）`));
              }, timeout);
            })
          ]);
        } else {
          return await fn();
        }
      } catch (error: any) {
        lastError = error;
        
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 等待后重试
        if (exponentialBackoff) {
          await this.sleep(delay);
          delay *= 2; // 指数退避
        } else {
          await this.sleep(retryDelay);
        }
      }
    }

    throw lastError || new Error('重试失败');
  }

  /**
   * 执行带降级策略的操作
   * 如果主策略失败，自动尝试降级策略
   */
  async executeWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    try {
      return await this.execute(primaryFn, options);
    } catch (primaryError) {
      // 主策略失败，尝试降级策略
      try {
        return await this.execute(fallbackFn, options);
      } catch (fallbackError) {
        // 两个策略都失败，抛出组合错误
        throw new Error(
          `主策略失败: ${primaryError.message}\n降级策略失败: ${fallbackError.message}`
        );
      }
    }
  }

  /**
   * 执行多个策略，直到有一个成功
   */
  async executeAny<T>(
    strategies: Array<() => Promise<T>>,
    options: RetryOptions = {}
  ): Promise<T> {
    const errors: Error[] = [];

    for (const strategy of strategies) {
      try {
        return await this.execute(strategy, options);
      } catch (error: any) {
        errors.push(error);
        continue;
      }
    }

    // 所有策略都失败
    throw new Error(
      `所有策略都失败:\n${errors.map((e, i) => `策略 ${i + 1}: ${e.message}`).join('\n')}`
    );
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
