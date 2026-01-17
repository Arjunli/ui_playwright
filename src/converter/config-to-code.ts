import { writeFileSync } from 'fs';
import path from 'path';
import type { TestConfig, TestStep } from '../types/test-config';

/**
 * 配置转代码转换器
 */
export class ConfigToCodeConverter {
  /**
   * 将测试配置转换为 TypeScript 代码
   */
  convert(config: TestConfig): string {
    const lines: string[] = [];

    // 导入语句
    lines.push("import { test, expect } from '@playwright/test';");
    lines.push("import { test as baseTest } from '../src/fixtures/custom-fixtures';");
    lines.push("");

    // 测试函数
    lines.push(`test('${config.name}', async ({ page }) => {`);
    lines.push("");

    // 执行步骤
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      const stepCode = this.convertStep(step, i + 1);
      lines.push(...stepCode);
      lines.push("");
    }

    lines.push("});");

    return lines.join('\n');
  }

  /**
   * 转换单个步骤为代码
   */
  private convertStep(step: TestStep, index: number): string[] {
    const lines: string[] = [];
    const comment = step.description ? `  // ${step.description}` : '';

    switch (step.action) {
      case 'navigate':
        if (step.value) {
          lines.push(`  // ${index}. 导航到页面`);
          lines.push(`  await page.goto('${step.value}');`);
        }
        break;

      case 'click':
        if (step.locator) {
          lines.push(`  // ${index}. 点击元素`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.click();`);
        }
        break;

      case 'fill':
        if (step.locator && step.value !== undefined) {
          lines.push(`  // ${index}. 填充输入`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.fill('${step.value}');`);
        }
        break;

      case 'select':
        if (step.locator && step.value !== undefined) {
          lines.push(`  // ${index}. 选择选项`);
          const locatorCode = this.locatorToCode(step.locator);
          const value = Array.isArray(step.value) ? step.value : [String(step.value)];
          lines.push(`  await ${locatorCode}.selectOption(${JSON.stringify(value)});`);
        }
        break;

      case 'check':
        if (step.locator) {
          lines.push(`  // ${index}. 勾选复选框`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.check();`);
        }
        break;

      case 'uncheck':
        if (step.locator) {
          lines.push(`  // ${index}. 取消勾选复选框`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.uncheck();`);
        }
        break;

      case 'hover':
        if (step.locator) {
          lines.push(`  // ${index}. 悬停元素`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.hover();`);
        }
        break;

      case 'press':
        if (step.value) {
          lines.push(`  // ${index}. 按下按键`);
          lines.push(`  await page.keyboard.press('${step.value}');`);
        }
        break;

      case 'wait':
        const timeout = step.value ? Number(step.value) : 1000;
        lines.push(`  // ${index}. 等待 ${timeout}ms`);
        lines.push(`  await page.waitForTimeout(${timeout});`);
        break;

      case 'screenshot':
        const name = step.value ? String(step.value) : `screenshot-${index}`;
        lines.push(`  // ${index}. 截图`);
        lines.push(`  await page.screenshot({ path: 'reports/screenshots/${name}.png' });`);
        break;

      case 'assert':
        lines.push(`  // ${index}. 断言`);
        lines.push(...this.convertAssertion(step));
        break;

      case 'scroll':
        if (step.locator) {
          lines.push(`  // ${index}. 滚动到元素`);
          const locatorCode = this.locatorToCode(step.locator);
          lines.push(`  await ${locatorCode}.scrollIntoViewIfNeeded();`);
        } else {
          lines.push(`  // ${index}. 滚动页面`);
          lines.push(`  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`);
        }
        break;

      default:
        lines.push(`  // ${index}. ${step.action} (未实现)`);
    }

    return lines;
  }

  /**
   * 将定位器转换为代码
   */
  private locatorToCode(locator: NonNullable<TestStep['locator']>): string {
    const strategy = locator.strategies[0]; // 使用第一个策略
    if (!strategy) {
      throw new Error('定位器没有策略');
    }

    switch (strategy.type) {
      case 'testid':
        return `page.getByTestId('${strategy.value}')`;
      case 'id':
        return `page.locator('#${strategy.value}')`;
      case 'role':
        if (strategy.name) {
          return `page.getByRole('${strategy.value}', { name: '${strategy.name}' })`;
        }
        return `page.getByRole('${strategy.value}')`;
      case 'name':
        return `page.locator('[name="${strategy.value}"]')`;
      case 'placeholder':
        return `page.getByPlaceholder('${strategy.value}')`;
      case 'text':
        return `page.getByText('${strategy.value}')`;
      case 'css':
        return `page.locator('${strategy.value}')`;
      case 'xpath':
        return `page.locator('xpath=${strategy.value}')`;
      default:
        return `page.locator('${strategy.value}')`;
    }
  }

  /**
   * 转换断言
   */
  private convertAssertion(step: TestStep): string[] {
    const lines: string[] = [];
    // 断言逻辑需要根据具体类型实现
    lines.push("  // TODO: 实现断言逻辑");
    return lines;
  }

  /**
   * 保存代码到文件
   */
  async save(config: TestConfig, outputPath: string): Promise<void> {
    const code = this.convert(config);
    const fullPath = path.resolve(process.cwd(), outputPath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    const fs = await import('fs/promises');
    await fs.mkdir(dir, { recursive: true });

    writeFileSync(fullPath, code, 'utf-8');
    console.log(`代码已保存到: ${fullPath}`);
  }
}
