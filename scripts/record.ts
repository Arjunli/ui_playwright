#!/usr/bin/env node
import { Command } from 'commander';
import { CustomRecorder } from '../src/recorder/custom-recorder';
import type { Platform } from '../src/types/test-config';

const program = new Command();

program
  .name('record')
  .description('录制测试用例')
  .option('-p, --platform <platform>', '平台类型 (web|mobile|desktop)', 'web')
  .option('-o, --output <path>', '输出文件路径', 'test-specs/recorded-test.json')
  .option('-u, --url <url>', '起始 URL', 'about:blank')
  .option('--headless', '无头模式', false)
  .action(async (options) => {
    const recorder = new CustomRecorder();

    console.log('开始录制...');
    console.log(`平台: ${options.platform}`);
    console.log(`输出: ${options.output}`);
    console.log(`起始 URL: ${options.url}`);

    try {
      await recorder.start({
        platform: options.platform as Platform,
        output: options.output,
        headless: options.headless,
        startUrl: options.url,
      });

      // 等待用户中断或通过 UI 保存
      process.on('SIGINT', async () => {
        console.log('\n停止录制...');
        await recorder.save({
          output: options.output,
        });
        process.exit(0);
      });

      // 监听页面中的保存和停止事件（通过 UI 按钮）
      const page = recorder.getPage();
      let isStopping = false;
      let checkCount = 0;
      
      if (page) {
        console.log('✅ 开始监听 UI 停止信号...');
        
        // 定期检查是否通过 UI 保存或停止
        const checkInterval = setInterval(async () => {
          if (isStopping) {
            return; // 已经在停止过程中，不再检查
          }
          
          checkCount++;
          
          try {
            // 添加调试：先检查页面是否可用
            if (page.isClosed()) {
              console.log('⚠️ 页面已关闭');
              isStopping = true;
              clearInterval(checkInterval);
              process.exit(0);
              return;
            }

            // 尝试多种方式检测停止信号
            let state: any = null;
            
            try {
              // 使用更直接的方式检测，尝试多种访问方式
              state = await page.evaluate(() => {
                // 方式1: 直接访问
                const stop1 = (window as any).__shouldStopRecording;
                const save1 = (window as any).__shouldSaveConfig;
                
                // 方式2: 通过 globalThis
                const stop2 = typeof globalThis !== 'undefined' ? (globalThis as any).__shouldStopRecording : undefined;
                const save2 = typeof globalThis !== 'undefined' ? (globalThis as any).__shouldSaveConfig : undefined;
                
                // 使用最严格的条件：必须是 true（不是 truthy）
                const shouldSave = save1 === true || save2 === true;
                const shouldStop = stop1 === true || stop2 === true;
                
                return { 
                  shouldSave, 
                  shouldStop
                };
              });
            } catch (evalError: any) {
              // 如果 evaluate 失败，忽略并继续
              return;
            }
            
            if (!state) {
              return;
            }

            if (state.shouldStop) {
              isStopping = true;
              clearInterval(checkInterval);
              
              console.log('\n🛑 检测到停止信号！正在保存配置...');
              
              // 清除标志
              try {
                await page.evaluate(() => {
                  const win = window as any;
                  win.__shouldStopRecording = false;
                  win.__shouldSaveConfig = false;
                });
              } catch (e) {
                console.warn('清除标志时出错（可忽略）:', e);
              }
              
              try {
                await recorder.save({
                  output: options.output,
                });
                console.log('✅ 录制已停止，配置已保存');
              } catch (error) {
                console.error('❌ 保存配置失败:', error);
              }
              
              // 强制退出
              setTimeout(() => {
                process.exit(0);
              }, 100);
            } else if (state.shouldSave) {
              // 只保存，不停止
              try {
                await page.evaluate(() => {
                  const win = window as any;
                  win.__shouldSaveConfig = false;
                });
                
                await recorder.save({
                  output: options.output,
                });
                console.log('✅ 配置已通过 UI 保存（录制继续）');
              } catch (error) {
                console.error('❌ 保存配置失败:', error);
              }
            }
          } catch (error: any) {
            // 如果页面已关闭，可能是用户关闭了浏览器
            if (error?.message?.includes('Target closed') || error?.message?.includes('closed')) {
              console.log('\n⚠️ 浏览器已关闭，停止录制...');
              isStopping = true;
              clearInterval(checkInterval);
              try {
                await recorder.save({
                  output: options.output,
                });
              } catch (e) {
                // 忽略保存错误
              }
              process.exit(0);
            }
            // 其他错误忽略，继续运行
          }
        }, 200); // 每 200ms 检查一次，更频繁
      }

      // 保持运行，直到被中断
      await new Promise<void>((resolve) => {
        // 这个 Promise 永远不会 resolve，保持程序运行
        // 直到 process.exit() 被调用
      });
    } catch (error) {
      console.error('录制失败:', error);
      process.exit(1);
    }
  });

program.parse();
