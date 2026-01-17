#!/usr/bin/env node
/**
 * 运行配置测试的脚本
 * 用法: npm run test:config -- test-specs/web/login.json
 */
import { ConfigExecutor } from '../src/executor/config-executor';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const configPath = process.argv[2];
const headless = process.argv.includes('--headed') ? false : true; // 默认无头模式，使用 --headed 显示浏览器
const projectIndex = process.argv.indexOf('--project');
// 如果没有指定项目，默认使用 chromium-web（谷歌浏览器）
const project = projectIndex > -1 ? process.argv[projectIndex + 1] : 'chromium-web';

if (!configPath) {
  console.error('错误: 需要指定配置文件路径');
  console.error('用法: npm run test:config -- <配置文件路径> [选项]');
  console.error('  选项:');
  console.error('    --headed: 显示浏览器界面（默认无头模式）');
  console.error('    --project <项目名>: 指定项目（默认: chromium-web，可选: firefox-web, webkit-web 等）');
  process.exit(1);
}

try {
  const fullPath = path.resolve(process.cwd(), configPath);
  
  // 检查文件是否存在
  try {
    readFileSync(fullPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ 错误: 配置文件不存在`);
      console.error(`   路径: ${fullPath}`);
      console.error('');
      
      // 查找可用的配置文件
      const testSpecsDir = path.join(process.cwd(), 'test-specs');
      try {
        const fs = require('fs');
        const findJsonFiles = (dir: string, fileList: string[] = []): string[] => {
          const files = fs.readdirSync(dir);
          files.forEach((file: string) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              findJsonFiles(filePath, fileList);
            } else if (file.endsWith('.json')) {
              fileList.push(path.relative(process.cwd(), filePath).replace(/\\/g, '/'));
            }
          });
          return fileList;
        };
        
        const availableFiles = findJsonFiles(testSpecsDir);
        if (availableFiles.length > 0) {
          console.error('💡 可用的配置文件:');
          availableFiles.forEach(file => {
            console.error(`   - ${file}`);
          });
          console.error('');
          console.error('💡 使用示例:');
          console.error(`   npm run test:config -- ${availableFiles[0]} --project chromium-web`);
        }
      } catch {
        // 忽略查找错误
      }
      
      process.exit(1);
    }
    throw error;
  }
  
  const config = ConfigExecutor.loadConfig(fullPath);

  // 创建临时测试文件
  const tempTestFile = path.join(process.cwd(), 'tests', 'temp-config-test.spec.ts');
  const testContent = `import { test } from '../src/fixtures/custom-fixtures';
import { ConfigExecutor } from '../src/executor/config-executor';
import path from 'path';

test('${config.name.replace(/'/g, "\\'")}', { timeout: 600000 }, async ({ page }) => {
  const configPath = ${JSON.stringify(fullPath)};
  const config = ConfigExecutor.loadConfig(configPath);
  const executor = new ConfigExecutor(page);
  
  // 设置环境
  if (config.environment) {
    await executor.setEnvironment(config.environment);
  }

  // 执行测试
  await executor.execute(config);
});
`;

  // 确保 tests 目录存在
  const testsDir = path.dirname(tempTestFile);
  try {
    mkdirSync(testsDir, { recursive: true });
  } catch (e) {
    // 目录可能已存在，忽略错误
  }
  
  writeFileSync(tempTestFile, testContent, 'utf-8');

  console.log(`✅ 已创建临时测试文件: ${tempTestFile}`);
  console.log(`📋 执行测试: ${config.name}`);
  console.log(`🚀 运行 Playwright 测试...\n`);

  // 使用 Playwright CLI 运行测试（使用文件名，因为 testDir 已配置为 ./tests）
  const testFileName = 'temp-config-test.spec.ts';
  console.log(`📝 运行测试文件: tests/${testFileName}`);
  console.log(`🖥️  浏览器模式: ${headless ? '无头模式' : '有界面模式'}\n`);
  
  // 构建命令参数
  const args = ['playwright', 'test', testFileName];
  if (!headless) {
    args.push('--headed'); // 显示浏览器界面
  }
  // 总是添加项目参数（默认使用 chromium-web）
  args.push('--project', project);
  console.log(`🎯 运行项目: ${project}`);
  
  // Windows 上需要使用 shell: true 来执行 npx
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'npx.cmd' : 'npx';
  const playwright = spawn(command, args, {
    stdio: 'inherit',
    shell: isWindows, // Windows 上使用 shell: true
    cwd: process.cwd()
  });

  playwright.on('close', (code: number) => {
    // 清理临时文件
    try {
      unlinkSync(tempTestFile);
      console.log(`\n🧹 已清理临时测试文件`);
    } catch (e) {
      // 忽略清理错误
    }
    process.exit(code || 0);
  });

  playwright.on('error', (error: Error) => {
    console.error('执行测试失败:', error);
    // 清理临时文件
    try {
      unlinkSync(tempTestFile);
    } catch (e) {
      // 忽略清理错误
    }
    process.exit(1);
  });

} catch (error: any) {
  console.error('加载配置失败:', error?.message || error);
  process.exit(1);
}
