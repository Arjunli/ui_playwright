import { readFileSync } from 'fs';
import type { TestConfig, TestStep } from '../types/test-config';

/**
 * 代码转配置转换器
 */
export class CodeToConfigConverter {
  /**
   * 从代码文件转换为测试配置
   */
  convert(code: string): TestConfig {
    const steps: TestStep[] = [];

    // 提取测试名称
    const testNameMatch = code.match(/test\(['"]([^'"]+)['"]/);
    const testName = testNameMatch ? testNameMatch[1] : '从代码转换的测试';

    // 解析导航
    const navigateMatches = code.match(/page\.goto\(['"]([^'"]+)['"]\)/g);
    if (navigateMatches) {
      for (const match of navigateMatches) {
        const url = match.match(/['"]([^'"]+)['"]/)?.[1];
        if (url) {
          steps.push({
            action: 'navigate',
            value: url,
            description: `导航到 ${url}`,
          });
        }
      }
    }

    // 解析点击
    const clickMatches = code.match(/(?:page|locator)\.(?:click|getBy\w+)\([^)]*\)\.click\(\)/g);
    if (clickMatches) {
      for (const match of clickMatches) {
        const locator = this.extractLocator(match);
        if (locator) {
          steps.push({
            action: 'click',
            locator: {
              strategies: [{ type: 'css', value: locator }],
            },
            description: '点击元素',
          });
        }
      }
    }

    // 解析填充
    const fillMatches = code.match(/(?:page|locator)\.(?:fill|getBy\w+)\([^)]*\)\.fill\([^)]*\)/g);
    if (fillMatches) {
      for (const match of fillMatches) {
        const locator = this.extractLocator(match);
        const value = this.extractValue(match);
        if (locator) {
          steps.push({
            action: 'fill',
            locator: {
              strategies: [{ type: 'css', value: locator }],
            },
            value,
            description: '填充输入',
          });
        }
      }
    }

    // 解析选择
    const selectMatches = code.match(/(?:page|locator)\.(?:selectOption|getBy\w+)\([^)]*\)\.selectOption\([^)]*\)/g);
    if (selectMatches) {
      for (const match of selectMatches) {
        const locator = this.extractLocator(match);
        const value = this.extractValue(match);
        if (locator) {
          steps.push({
            action: 'select',
            locator: {
              strategies: [{ type: 'css', value: locator }],
            },
            value,
            description: '选择选项',
          });
        }
      }
    }

    // 解析断言
    const expectMatches = code.match(/expect\([^)]+\)\.to\w+\([^)]*\)/g);
    if (expectMatches) {
      for (const match of expectMatches) {
        const assertion = this.parseAssertion(match);
        if (assertion) {
          steps.push(assertion);
        }
      }
    }

    return {
      name: testName,
      platform: this.detectPlatform(code),
      steps,
    };
  }

  /**
   * 提取定位器
   */
  private extractLocator(code: string): string | null {
    // 匹配 getByTestId('...')
    const testIdMatch = code.match(/getByTestId\(['"]([^'"]+)['"]\)/);
    if (testIdMatch) {
      return `[data-testid="${testIdMatch[1]}"]`;
    }

    // 匹配 getByRole('...')
    const roleMatch = code.match(/getByRole\(['"]([^'"]+)['"]/);
    if (roleMatch) {
      return `role=${roleMatch[1]}`;
    }

    // 匹配 getByText('...')
    const textMatch = code.match(/getByText\(['"]([^'"]+)['"]\)/);
    if (textMatch) {
      return `text="${textMatch[1]}"`;
    }

    // 匹配 locator('...')
    const locatorMatch = code.match(/locator\(['"]([^'"]+)['"]\)/);
    if (locatorMatch) {
      return locatorMatch[1];
    }

    return null;
  }

  /**
   * 提取值
   */
  private extractValue(code: string): string | null {
    const valueMatch = code.match(/\(['"]([^'"]+)['"]\)/);
    if (valueMatch) {
      return valueMatch[1];
    }
    return null;
  }

  /**
   * 解析断言
   */
  private parseAssertion(code: string): TestStep | null {
    // 简化处理，实际需要更复杂的解析
    if (code.includes('toBeVisible')) {
      return {
        action: 'assert',
        assertionType: 'visible',
        description: '断言元素可见',
      } as any;
    }
    return null;
  }

  /**
   * 检测平台
   */
  private detectPlatform(code: string): 'web' | 'mobile' | 'desktop' {
    if (code.includes('mobile') || code.includes('device')) {
      return 'mobile';
    }
    if (code.includes('desktop') || code.includes('app')) {
      return 'desktop';
    }
    return 'web';
  }

  /**
   * 从文件转换
   */
  convertFromFile(filePath: string): TestConfig {
    const code = readFileSync(filePath, 'utf-8');
    return this.convert(code);
  }
}
