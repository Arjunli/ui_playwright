#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { ConfigToCodeConverter } from '../src/converter/config-to-code';
import { CodeToConfigConverter } from '../src/converter/code-to-config';
import type { TestConfig } from '../src/types/test-config';

const program = new Command();

program
  .name('convert')
  .description('转换测试格式')
  .option('-i, --input <path>', '输入文件路径')
  .option('-o, --output <path>', '输出文件路径')
  .option('-t, --type <type>', '转换类型 (config-to-code|code-to-config)', 'config-to-code')
  .action(async (options) => {
    if (!options.input) {
      console.error('错误: 需要指定输入文件 (-i, --input)');
      process.exit(1);
    }

    if (!options.output) {
      console.error('错误: 需要指定输出文件 (-o, --output)');
      process.exit(1);
    }

    try {
      if (options.type === 'config-to-code') {
        // 配置转代码
        const configContent = readFileSync(options.input, 'utf-8');
        const config: TestConfig = JSON.parse(configContent);
        const converter = new ConfigToCodeConverter();
        await converter.save(config, options.output);
        console.log('转换完成: 配置 -> 代码');
      } else if (options.type === 'code-to-config') {
        // 代码转配置
        const converter = new CodeToConfigConverter();
        const config = converter.convertFromFile(options.input);
        const fs = await import('fs');
        const path = await import('path');
        const outputPath = path.resolve(process.cwd(), options.output);
        const dir = path.dirname(outputPath);
        const fsPromises = await import('fs/promises');
        await fsPromises.mkdir(dir, { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log('转换完成: 代码 -> 配置');
      } else {
        console.error('错误: 不支持的转换类型');
        process.exit(1);
      }
    } catch (error) {
      console.error('转换失败:', error);
      process.exit(1);
    }
  });

program.parse();
