import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { TestConfig, TestStep } from '../types/test-config';

/**
 * Playwright Codegen 适配器
 * 将 Playwright Codegen 生成的代码转换为测试配置
 */
export class CodegenAdapter {
  /**
   * 从代码文件转换为测试配置
   */
  async convertCodeToConfig(codePath: string): Promise<TestConfig> {
    const code = readFileSync(codePath, 'utf-8');
    const steps = this.parseCodeToSteps(code);

    return {
      name: this.extractTestName(code) || '从代码转换的测试',
      platform: this.detectPlatform(code),
      steps,
    };
  }

  /**
   * 解析代码为测试步骤
   */
  private parseCodeToSteps(code: string): TestStep[] {
    const steps: TestStep[] = [];

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
    const clickMatches = code.match(/page\.(click|locator\([^)]+\)\.click)\([^)]*\)/g);
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
    const fillMatches = code.match(/page\.(fill|locator\([^)]+\)\.fill)\([^)]*\)/g);
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
    const selectMatches = code.match(/page\.(selectOption|locator\([^)]+\)\.selectOption)\([^)]*\)/g);
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

    // 解析勾选
    const checkMatches = code.match(/page\.(check|locator\([^)]+\)\.check)\([^)]*\)/g);
    if (checkMatches) {
      for (const match of checkMatches) {
        const locator = this.extractLocator(match);
        if (locator) {
          steps.push({
            action: 'check',
            locator: {
              strategies: [{ type: 'css', value: locator }],
            },
            description: '勾选复选框',
          });
        }
      }
    }

    return steps;
  }

  /**
   * 提取定位器
   */
  private extractLocator(code: string): string | null {
    // 匹配 locator('...') 或 getByRole('...') 等
    const locatorMatch = code.match(/(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId)\(['"]([^'"]+)['"]\)/);
    if (locatorMatch) {
      return locatorMatch[1];
    }

    // 匹配 CSS 选择器
    const cssMatch = code.match(/locator\(['"]([^'"]+)['"]\)/);
    if (cssMatch) {
      return cssMatch[1];
    }

    return null;
  }

  /**
   * 提取值
   */
  private extractValue(code: string): string | null {
    const valueMatch = code.match(/,\s*['"]([^'"]+)['"]/);
    if (valueMatch) {
      return valueMatch[1];
    }
    return null;
  }

  /**
   * 提取测试名称
   */
  private extractTestName(code: string): string | null {
    const testMatch = code.match(/test\(['"]([^'"]+)['"]/);
    if (testMatch) {
      return testMatch[1];
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
   * 批量转换文件
   */
  async convertBatch(filePaths: string[], outputDir: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.mkdir(outputDir, { recursive: true });

    for (const filePath of filePaths) {
      try {
        const config = await this.convertCodeToConfig(filePath);
        const fileName = path.basename(filePath, path.extname(filePath));
        const outputPath = path.join(outputDir, `${fileName}.json`);
        writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`已转换: ${filePath} -> ${outputPath}`);
      } catch (error) {
        console.error(`转换失败 ${filePath}:`, error);
      }
    }
  }
}
