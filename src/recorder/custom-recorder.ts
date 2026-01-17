import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import { ActionCapture } from './action-capture';
import { RecorderUI } from './recorder-ui';
import type { TestConfig, Platform } from '../types/test-config';
import { writeFileSync } from 'fs';
import path from 'path';

export interface RecorderOptions {
  platform?: Platform;
  output?: string;
  headless?: boolean;
  startUrl?: string;
}

export class CustomRecorder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private actionCapture: ActionCapture | null = null;
  private recorderUI: RecorderUI | null = null;
  private isRecording = false;
  private startUrl: string = 'about:blank'; // 记录起始URL
  private platform: Platform = 'web'; // 记录平台类型

  /**
   * 开始录制
   */
  async start(options: RecorderOptions = {}): Promise<void> {
    const {
      platform = 'web',
      headless = false,
      startUrl = 'about:blank',
    } = options;
    
    // 保存起始URL和平台类型
    this.startUrl = startUrl;
    this.platform = platform;

    // 启动浏览器
    this.browser = await chromium.launch({
      headless,
      slowMo: 100, // 慢速模式，便于观察
    });

    // 创建上下文
    const device = platform === 'mobile' 
      ? { viewport: { width: 375, height: 667 }, isMobile: true }
      : { viewport: { width: 1920, height: 1080 } };

    this.context = await this.browser.newContext(device);
    this.page = await this.context.newPage();

    // 创建 UI 组件
    this.recorderUI = new RecorderUI(this.page);

    // 创建操作捕获器（传入 UI 组件）
    this.actionCapture = new ActionCapture(this.page, this.recorderUI);

    // 导航到起始页面
    if (startUrl !== 'about:blank') {
      await this.page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await this.page.goto('about:blank');
    }

    // 等待一下确保页面稳定
    await this.page.waitForTimeout(1000);

    // 显示 UI 面板
    try {
      await this.recorderUI.show();
      console.log('✅ UI 面板显示成功');
    } catch (error) {
      console.error('❌ UI 面板显示失败:', error);
      // 重试一次
      await this.page.waitForTimeout(1000);
      await this.recorderUI.show();
    }

    // 开始录制
    await this.actionCapture.startRecording();
    this.isRecording = true;

    console.log('录制已开始，请在浏览器中操作...');
    console.log('录制控制面板已显示在页面右上角');
    console.log('按 Ctrl+C 停止录制');
  }

  /**
   * 停止录制
   */
  async stop(): Promise<TestConfig | null> {
    if (!this.actionCapture || !this.isRecording) {
      return null;
    }

    this.isRecording = false;
    this.actionCapture.stopRecording();

    // 获取捕获的操作
    const steps = await this.actionCapture.convertToTestSteps();

    // 生成测试配置（在关闭浏览器之前）
    const testConfig: TestConfig = {
      name: '录制的测试',
      platform: 'web',
      steps,
    };

    // 关闭浏览器（最后关闭）
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        // 忽略关闭浏览器时的错误
        console.warn('关闭浏览器时出错:', error);
      }
    }

    return testConfig;
  }

  /**
   * 保存配置到文件
   */
  async save(options: RecorderOptions = {}): Promise<void> {
    console.log('💾 开始保存配置...');
    
    // 先获取操作步骤（在停止之前）
    let steps: any[] = [];
    if (this.actionCapture && this.isRecording) {
      try {
        steps = await this.actionCapture.convertToTestSteps();
        console.log(`📝 已捕获 ${steps.length} 个操作步骤`);
      } catch (error) {
        console.warn('获取操作步骤时出错:', error);
      }
    }
    
    const config: TestConfig = {
      name: '录制的测试',
      platform: this.platform,
      startUrl: this.startUrl !== 'about:blank' ? this.startUrl : undefined,
      steps,
    };

    const outputPath = options.output || 'test-specs/recorded-test.json';
    const fullPath = path.resolve(process.cwd(), outputPath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    const fs = await import('fs/promises');
    await fs.mkdir(dir, { recursive: true });

    // 保存文件
    writeFileSync(fullPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ 测试配置已保存到: ${fullPath}`);
    
    // 停止录制（但不关闭浏览器，因为可能还需要继续使用）
    if (this.isRecording) {
      this.isRecording = false;
      if (this.actionCapture) {
        this.actionCapture.stopRecording();
      }
    }
  }

  /**
   * 暂停录制
   */
  async pause(): Promise<void> {
    if (this.recorderUI) {
      await this.page.evaluate(() => {
        if ((window as any).__togglePause) {
          (window as any).__togglePause();
        }
      });
    }
  }

  /**
   * 继续录制
   */
  async resume(): Promise<void> {
    if (this.recorderUI) {
      await this.page.evaluate(() => {
        if ((window as any).__togglePause) {
          (window as any).__togglePause();
        }
      });
    }
  }

  /**
   * 获取当前页面
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 是否正在录制
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }
}
