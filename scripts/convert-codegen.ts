#!/usr/bin/env node
import { Command } from 'commander';
import { CodegenAdapter } from '../src/recorder/codegen-adapter';
import { writeFileSync } from 'fs';
import path from 'path';

const program = new Command();

program
  .name('convert-codegen')
  .description('将 Playwright Codegen 生成的代码转换为配置')
  .argument('<input>', '输入的代码文件路径')
  .option('-o, --output <path>', '输出配置文件路径')
  .action(async (input, options) => {
    try {
      const adapter = new CodegenAdapter();
      const config = await adapter.convertCodeToConfig(input);

      const outputPath = options.output || input.replace(/\.(ts|js)$/, '.json');
      const fullPath = path.resolve(process.cwd(), outputPath);

      // 确保目录存在
      const dir = path.dirname(fullPath);
      const fs = await import('fs/promises');
      await fs.mkdir(dir, { recursive: true });

      writeFileSync(fullPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`转换完成: ${input} -> ${fullPath}`);
    } catch (error) {
      console.error('转换失败:', error);
      process.exit(1);
    }
  });

program.parse();
