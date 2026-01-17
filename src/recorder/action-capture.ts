import { Page } from '@playwright/test';
import type { TestStep, TestAction } from '../types/test-config';
import { LocatorGenerator } from './locator-generator';
import { RecorderUI } from './recorder-ui';
import { MenuDetector } from './menu-detector';

export interface CapturedAction {
  type: 'click' | 'fill' | 'navigate' | 'keypress' | 'select' | 'check' | 'uncheck' | 'hover' | 'scroll';
  timestamp: number;
  data: any;
}

export class ActionCapture {
  private capturedActions: CapturedAction[] = [];
  private locatorGenerator: LocatorGenerator;
  private recorderUI: RecorderUI | null = null;
  private isRecording = false;
  private lastClickTime: number = 0; // 记录最后一次点击的时间
  private clickNavigationWindow: number = 2000; // 点击后2秒内的导航视为点击导致的
  private lastKeyPressTime: number = 0; // 记录最后一次按键的时间
  private keyPressNavigationWindow: number = 2000; // 按键后2秒内的导航视为按键导致的
  private stepIndex: number = 0; // 录制步骤计数器

  constructor(private page: Page, recorderUI?: RecorderUI) {
    this.locatorGenerator = new LocatorGenerator(page);
    this.recorderUI = recorderUI || null;
  }

  /**
   * 开始录制
   */
  async startRecording(): Promise<void> {
    this.isRecording = true;
    this.capturedActions = [];
    this.stepIndex = 0; // 重置步骤计数器
    console.log('🎬 开始录制...');

    // 监听页面导航（但会检查是否是点击或按键导致的）
    this.page.on('framenavigated', async (frame) => {
      // 检查页面是否已关闭
      if (this.page.isClosed()) {
        return;
      }
      
      if (frame === this.page.mainFrame() && this.isRecording) {
        // 检查是否是按键操作导致的导航（特别是 Enter 键）
        const timeSinceLastKeyPress = Date.now() - this.lastKeyPressTime;
        if (timeSinceLastKeyPress < this.keyPressNavigationWindow && this.lastKeyPressTime > 0) {
          const lastAction = this.capturedActions[this.capturedActions.length - 1];
          if (lastAction && lastAction.type === 'keypress' && lastAction.data.key === 'Enter') {
            // 这是按键（Enter）导致的导航，不记录为单独的 navigate 操作
            // 而是标记在最后一个按键操作上
            lastAction.data.expectedNavigation = frame.url();
            lastAction.data.navigationOccurred = true;
            console.log(`✅ 检测到按键操作（Enter）导致的导航: ${frame.url()}，已标记在按键操作上，不单独记录`);
            return; // 不记录为单独的 navigate
          }
        }
        
        // 检查是否是点击操作导致的导航
        const timeSinceLastClick = Date.now() - this.lastClickTime;
        if (timeSinceLastClick < this.clickNavigationWindow && this.lastClickTime > 0) {
          // 这是点击导致的导航，不记录为单独的 navigate 操作
          // 而是标记在最后一个点击操作上
          const lastAction = this.capturedActions[this.capturedActions.length - 1];
          if (lastAction && lastAction.type === 'click') {
            lastAction.data.expectedNavigation = frame.url();
            lastAction.data.navigationOccurred = true;
            console.log(`✅ 检测到点击操作导致的导航: ${frame.url()}，已标记在点击操作上，不单独记录`);
            return; // 不记录为单独的 navigate
          }
        }
        
        // 其他情况的导航才记录
        await this.captureNavigation(frame.url());
      }
    });

    // 注入脚本监听 DOM 事件（在页面加载后注入，确保能捕获事件）
    // 同时注入 __playwrightGetElementData 函数，确保在点击事件捕获时可以使用
    const injectScript = `
      (function() {
        if (window.__playwrightRecorderInitialized) return;
        window.__playwrightRecorderInitialized = true;
        
        window.__playwrightRecorderEvents = window.__playwrightRecorderEvents || [];
        
        // 确保 __playwrightGetElementData 函数存在（如果 LocatorGenerator 还没有注入）
        if (!window.__playwrightGetElementData) {
          window.__playwrightGetElementData = function(x, y) {
            let el = document.elementFromPoint(x, y);
            if (!el) return null;
            
            // 优先查找可交互的元素（button、a、input 等）
            let current = el;
            const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
            const maxDepth = 5;
            let depth = 0;
            
            while (current && depth < maxDepth) {
              const tagName = current.tagName.toLowerCase();
              if (interactiveTags.includes(tagName) || 
                  current.getAttribute('role') === 'button' ||
                  current.getAttribute('role') === 'link' ||
                  current.getAttribute('onclick') ||
                  current.style.cursor === 'pointer') {
                el = current;
                break;
              }
              const text = current.textContent?.trim() || '';
              if (text && text.length < 20 && (tagName === 'span' || tagName === 'div')) {
                let parent = current.parentElement;
                while (parent && parent !== document.body) {
                  if (parent.tagName.toLowerCase() === 'button' || 
                      parent.getAttribute('role') === 'button') {
                    el = parent;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (el !== current) break;
              }
              current = current.parentElement;
              depth++;
            }
            
            // 返回基本元素数据（简化版本，完整版本在 LocatorGenerator 中）
            const tagName = el.tagName?.toLowerCase() || '';
            const id = el.id || undefined;
            // 确保 className 是字符串（DOMTokenList 需要转换）
            let className = '';
            if (el.className) {
              if (typeof el.className === 'string') {
                className = el.className;
              } else if (el.className.toString) {
                className = el.className.toString();
              } else {
                className = Array.isArray(el.className) ? el.className.join(' ') : String(el.className);
              }
            }
            const text = (el.innerText || el.textContent || '').trim();
            const role = el.getAttribute('role') || undefined;
            const testId = el.getAttribute('data-testid') || undefined;
            const ariaLabel = el.getAttribute('aria-label') || undefined;
            const name = el.getAttribute('name') || undefined;
            const placeholder = el.getAttribute('placeholder') || undefined;
            
            const attributes = {};
            for (let i = 0; i < el.attributes.length; i++) {
              const attr = el.attributes[i];
              attributes[attr.name] = attr.value;
            }
            
            return {
              tagName: tagName,
              id: id,
              className: className,
              name: name,
              placeholder: placeholder,
              text: text,
              role: role,
              testId: testId,
              ariaLabel: ariaLabel,
              attributes: attributes
            };
          };
        }
        
        function captureClick(event) {
          // 忽略录制面板内的点击
          if (event.target && event.target.closest && event.target.closest('#playwright-recorder-panel')) {
            return;
          }
          
          // 立即获取元素数据（在对话框关闭之前）
          // 这样可以避免点击关闭按钮后元素被移除导致无法获取数据
          let elementDataSnapshot = null;
          try {
            const getElementData = window.__playwrightGetElementData;
            if (typeof getElementData === 'function') {
              elementDataSnapshot = getElementData(event.clientX, event.clientY);
            }
          } catch (e) {
            // 如果获取失败，继续使用坐标方式
          }
          
          window.__playwrightRecorderEvents.push({
            type: 'click',
            data: { 
              x: event.clientX, 
              y: event.clientY, 
              target: event.target,
              elementDataSnapshot: elementDataSnapshot, // 保存元素数据快照
              timestamp: Date.now()
            },
            timestamp: Date.now()
          });
        }
        
        function captureInput(event) {
          // 忽略录制面板内的输入
          if (event.target && event.target.closest && event.target.closest('#playwright-recorder-panel')) {
            return;
          }
          const target = event.target;
          // 获取元素的定位信息（在浏览器端）
          const rect = target.getBoundingClientRect();
          window.__playwrightRecorderEvents.push({
            type: 'input',
            data: { 
              value: target.value, 
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              tagName: target.tagName,
              id: target.id,
              name: target.name,
              placeholder: target.placeholder,
              testId: target.getAttribute('data-testid'),
              className: target.className,
              timestamp: Date.now()
            },
            timestamp: Date.now()
          });
        }
        
        function captureKeyPress(event) {
          if (event.key === 'Enter' || event.key === 'Escape') {
            window.__playwrightRecorderEvents.push({
              type: 'keypress',
              data: { 
                key: event.key, 
                target: event.target,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });
          }
        }
        
        let lastHoverTime = 0;
        let hoverDebounceTimer = null;
        
        function captureHover(event) {
          // 忽略录制面板内的悬停
          if (event.target && event.target.closest && event.target.closest('#playwright-recorder-panel')) {
            return;
          }
          
          // 防抖：避免频繁触发（300ms 内的多次 hover 只记录一次）
          const now = Date.now();
          if (now - lastHoverTime < 300) {
            if (hoverDebounceTimer) {
              clearTimeout(hoverDebounceTimer);
            }
            hoverDebounceTimer = setTimeout(() => {
              window.__playwrightRecorderEvents.push({
                type: 'hover',
                data: { 
                  x: event.clientX, 
                  y: event.clientY, 
                  target: event.target,
                  timestamp: Date.now()
                },
                timestamp: Date.now()
              });
              lastHoverTime = Date.now();
            }, 300);
            return;
          }
          
          lastHoverTime = now;
          window.__playwrightRecorderEvents.push({
            type: 'hover',
            data: { 
              x: event.clientX, 
              y: event.clientY, 
              target: event.target,
              timestamp: Date.now()
            },
            timestamp: Date.now()
          });
        }
        
        // 监听点击事件（使用捕获阶段，确保能捕获所有点击）
        document.addEventListener('click', captureClick, true);
        // 监听输入事件
        document.addEventListener('input', captureInput, true);
        // 监听按键事件
        document.addEventListener('keydown', captureKeyPress, true);
        // 注意：不再自动监听悬停事件，改为通过手动按钮添加
        
        console.log('✅ Playwright 录制器事件监听已启动');
      })();
    `;
    
    // 先通过 addInitScript 注入（用于后续页面）
    await this.page.addInitScript(injectScript);
    
    // 如果页面已经加载，立即注入
    await this.page.evaluate(injectScript);

    // 监听自定义事件
    await this.page.evaluate(() => {
      window.addEventListener('__playwright_click', async (e: any) => {
        const detail = e.detail;
        // 通过 CDP 发送到 Node.js 端
        (window as any).__playwrightRecorderEvents = (window as any).__playwrightRecorderEvents || [];
        (window as any).__playwrightRecorderEvents.push({
          type: 'click',
          data: detail,
          timestamp: Date.now(),
        });
      });

      window.addEventListener('__playwright_input', async (e: any) => {
        const detail = e.detail;
        (window as any).__playwrightRecorderEvents = (window as any).__playwrightRecorderEvents || [];
        (window as any).__playwrightRecorderEvents.push({
          type: 'input',
          data: detail,
          timestamp: Date.now(),
        });
      });

      window.addEventListener('__playwright_keypress', async (e: any) => {
        const detail = e.detail;
        (window as any).__playwrightRecorderEvents = (window as any).__playwrightRecorderEvents || [];
        (window as any).__playwrightRecorderEvents.push({
          type: 'keypress',
          data: detail,
          timestamp: Date.now(),
        });
      });

      // 监听手动悬停事件
      window.addEventListener('__playwright_hover_manual', async (e: any) => {
        const detail = e.detail;
        (window as any).__playwrightRecorderEvents = (window as any).__playwrightRecorderEvents || [];
        (window as any).__playwrightRecorderEvents.push({
          type: 'hover',
          data: detail,
          timestamp: Date.now(),
        });
      });
    });

    // 定期检查事件
    this.pollEvents();
  }

  /**
   * 停止录制
   */
  stopRecording(): void {
    this.isRecording = false;
  }

  /**
   * 轮询事件
   */
  private async pollEvents(): Promise<void> {
    while (this.isRecording) {
      try {
        const events = await this.page.evaluate(() => {
          const events = (window as any).__playwrightRecorderEvents || [];
          (window as any).__playwrightRecorderEvents = [];
          return events;
        });

        for (const event of events) {
          await this.handleEvent(event);
        }
      } catch (error) {
        console.error('轮询事件失败:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 处理事件
   */
  private async handleEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'click':
        await this.captureClick(event.data.x, event.data.y, event.data);
        break;
      case 'input':
        await this.captureInput(event.data.x, event.data.y, event.data);
        break;
            case 'keypress':
              await this.captureKeyPress(event.data.key, event.data.target);
              break;
            case 'hover':
              await this.captureHover(event.data.x, event.data.y);
              break;
    }
  }

  /**
   * 捕获点击（改进版：自动检测子菜单项点击，添加父菜单悬停步骤）
   */
  private async captureClick(x: number, y: number, eventData?: any): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    // 检查是否暂停
    if (this.recorderUI) {
      try {
        const paused = await this.recorderUI.isPaused();
        if (paused) {
          return;
        }
      } catch (error: any) {
        // 如果页面在检查过程中关闭，忽略错误并继续
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }

    const clickTime = Date.now();

    // 优先使用事件中的元素数据快照（在对话框关闭之前获取的）
    let elementData = eventData?.elementDataSnapshot || null;
    
    // 如果没有快照，尝试从坐标获取元素数据
    if (!elementData) {
      elementData = await this.page.evaluate((args: { x: number; y: number }) => {
        // @ts-ignore
        const getElementData = (window as any).__playwrightGetElementData;
        if (typeof getElementData === 'function') {
          return getElementData(args.x, args.y);
        }
        return null;
      }, { x, y });
    }
    
    // 如果仍然无法获取元素数据，尝试从 event.target 获取
    if (!elementData && eventData?.target) {
      try {
        // 尝试从 event.target 获取元素信息
        elementData = await this.page.evaluate((targetElement) => {
          if (!targetElement) return null;
          
          const getElementData = (window as any).__playwrightGetElementData;
          if (typeof getElementData === 'function') {
            // 获取元素的坐标
            const rect = targetElement.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            return getElementData(x, y);
          }
          return null;
        }, eventData.target);
      } catch (e) {
        // 如果从 target 获取失败，继续
      }
    }
    
    if (!elementData) {
      console.log('⚠️ 无法获取元素数据，跳过记录');
      return;
    }
    
    // 检测菜单结构
    const menuStructure = MenuDetector.detectMenuStructure(elementData);
    
    // 如果点击的是子菜单项，自动添加父菜单悬停步骤
    if (menuStructure.isChildMenuItem && menuStructure.parentMenu) {
      // 检查是否已经有父菜单悬停步骤（在最近2秒内）
      const recentHover = this.capturedActions
        .slice(-5) // 检查最近5个操作
        .reverse()
        .find(action => 
          action.type === 'hover' && 
          action.data?.isParentMenuHover &&
          action.data?.menuStructure?.text === menuStructure.parentMenu?.text &&
          clickTime - action.timestamp < 2000
        );
      
      if (!recentHover) {
        console.log(`✅ 检测到子菜单项点击，自动添加父菜单悬停步骤: ${menuStructure.parentMenu.text}`);
        
        // 生成父菜单的定位策略
        const parentMenuStrategies = MenuDetector.generateParentMenuLocator(menuStructure.parentMenu);
        
        if (parentMenuStrategies.length > 0) {
          // 添加父菜单悬停步骤
          const parentHoverAction: CapturedAction = {
            type: 'hover',
            timestamp: clickTime - 100, // 稍微提前时间戳，确保在点击之前
            data: {
              x,
              y,
              locator: {
                strategies: parentMenuStrategies,
                description: `定位${menuStructure.parentMenu.text}父菜单并悬停`,
              },
              isParentMenuHover: true,
              menuStructure: menuStructure.parentMenu,
            },
          };
          
          this.capturedActions.push(parentHoverAction);
          
          // 更新 UI
          if (this.recorderUI) {
            await this.recorderUI.addAction({
              type: '悬停',
              details: `悬停${menuStructure.parentMenu.text}父菜单，展开子选项`,
              timestamp: parentHoverAction.timestamp,
            });
          }
        }
      }
    }

    const locatorConfig = await this.locatorGenerator.generateFromClick(x, y);
    if (!locatorConfig) {
      console.log('⚠️ 无法生成定位策略，跳过记录');
      return;
    }
    
    // 检查策略是否为空
    if (!locatorConfig.strategies || locatorConfig.strategies.length === 0) {
      console.log('⚠️ 定位策略为空，跳过记录');
      return;
    }
    
    // 检查是否有相同定位器的上一个 click 操作（在1秒内，视为重复点击）
    const lastClickIndex = this.findLastActionIndex('click', locatorConfig, 1000);
    
    if (lastClickIndex >= 0) {
      // 重复点击，跳过不记录
      console.log('⚠️ 检测到重复点击，已跳过');
      return;
    }
    
    this.lastClickTime = clickTime;
    
    // 获取元素描述（用于日志）
    const elementDescription = locatorConfig.description || 
      locatorConfig.strategies?.[0]?.value || 
      '未知元素';
    
    // 输出步骤日志
    console.log(`[录制步骤 ${this.stepIndex}] 🖱️  点击: ${elementDescription}`);
    
    const action: CapturedAction = {
      type: 'click',
      timestamp: clickTime,
      data: { 
        locator: locatorConfig, 
        x, 
        y,
        menuStructure: menuStructure.isMenuElement ? menuStructure : undefined,
      },
    };
    
    this.capturedActions.push(action);

    // 更新 UI
    if (this.recorderUI) {
      const strategy = locatorConfig.strategies[0];
      const details = strategy 
        ? `${strategy.type}: ${strategy.value}${strategy.name ? ` (${strategy.name})` : ''}`
        : '点击元素';
      await this.recorderUI.addAction({
        type: '点击',
        details,
        timestamp: action.timestamp,
      });
    }
    
    // 等待一小段时间，检查是否出现了对话框（点击按钮后可能触发对话框）
    // 如果出现对话框，将其信息记录到点击操作中，而不是记录为独立的对话框点击
    setTimeout(() => {
      // 使用立即执行的异步函数来处理异步操作
      (async () => {
        try {
          const dialogExists = await this.page.evaluate(() => {
            return !!document.querySelector('div.el-overlay-message-box, [role="dialog"]');
          });
          
          if (dialogExists) {
            // 对话框出现了，获取对话框信息
            const dialogInfo = await this.page.evaluate(() => {
              const dialog = document.querySelector('div.el-overlay-message-box, [role="dialog"]');
              if (!dialog) return null;
              
              // 获取对话框的文本内容
              const textContent = dialog.textContent || '';
              return {
                text: textContent.trim(),
                exists: true
              };
            });
            
            if (dialogInfo && dialogInfo.exists) {
              // 将对话框信息记录到点击操作中
              const lastAction = this.capturedActions[this.capturedActions.length - 1];
              if (lastAction && lastAction.type === 'click') {
                lastAction.data.expectedDialog = dialogInfo.text;
                lastAction.data.dialogOccurred = true;
                console.log(`✅ 检测到点击操作触发的对话框: ${dialogInfo.text}，已标记在点击操作上`);
              }
            }
          }
        } catch (error) {
          // 忽略错误，继续执行
        }
      })();
    }, 500); // 等待500ms后检查对话框
  }

  /**
   * 捕获输入
   */
  private async captureInput(x: number, y: number, data: any): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    // 检查是否暂停
    if (this.recorderUI) {
      try {
        const paused = await this.recorderUI.isPaused();
        if (paused) {
          return;
        }
      } catch (error: any) {
        // 如果页面在检查过程中关闭，忽略错误并继续
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }

    // 使用坐标生成定位器（和点击类似）
    const locatorConfig = await this.locatorGenerator.generateFromClick(x, y);
    if (locatorConfig) {
      // 检查是否有相同定位器的上一个 fill 操作（在2秒内）
      const now = Date.now();
      const lastFillIndex = this.findLastActionIndex('fill', locatorConfig, 2000);
      
      if (lastFillIndex >= 0) {
        // 更新上一个 fill 操作的值，而不是添加新的
        this.capturedActions[lastFillIndex].data.value = data.value;
        this.capturedActions[lastFillIndex].timestamp = now;
        
        // 更新 UI（删除旧操作，添加新操作）
        if (this.recorderUI) {
          const strategy = locatorConfig.strategies[0];
          const details = strategy 
            ? `输入 "${data.value}" 到 ${strategy.type}: ${strategy.value}`
            : `输入 "${data.value}"`;
          // 删除旧操作（通过重新添加列表）
          const actions = await this.recorderUI.getActions();
          if (actions.length > lastFillIndex) {
            actions[lastFillIndex] = {
              type: '输入',
              details,
              timestamp: now,
            };
            await this.recorderUI.clearActions();
            for (const act of actions) {
              await this.recorderUI.addAction(act);
            }
          }
        }
      } else {
        // 增加步骤计数器
        this.stepIndex++;
        
        // 获取元素描述（用于日志）
        const elementDescription = locatorConfig.description || 
          locatorConfig.strategies?.[0]?.value || 
          '未知输入框';
        
        // 输出步骤日志
        console.log(`[录制步骤 ${this.stepIndex}] ⌨️  输入: ${elementDescription} = "${data.value}"`);
        
        // 添加新的 fill 操作
        const action: CapturedAction = {
          type: 'fill',
          timestamp: now,
          data: { locator: locatorConfig, value: data.value },
        };
        
        this.capturedActions.push(action);

        // 更新 UI
        if (this.recorderUI) {
          const strategy = locatorConfig.strategies[0];
          const details = strategy 
            ? `输入 "${data.value}" 到 ${strategy.type}: ${strategy.value}`
            : `输入 "${data.value}"`;
          await this.recorderUI.addAction({
            type: '输入',
            details,
            timestamp: action.timestamp,
          });
        }
      }
    }
  }

  /**
   * 查找相同定位器的上一个操作索引
   * 参考 DeploySentinel Recorder 的最佳实践：优先比较精确策略，确保不同元素不会被错误合并
   */
  private findLastActionIndex(
    actionType: string, 
    locatorConfig: any, 
    timeWindow: number = 2000
  ): number {
    const now = Date.now();
    // 从后往前查找
    for (let i = this.capturedActions.length - 1; i >= 0; i--) {
      const action = this.capturedActions[i];
      if (action.type === actionType) {
        // 检查时间窗口
        if (now - action.timestamp > timeWindow) {
          break; // 超出时间窗口，停止查找
        }
        // 检查定位器是否相同（比较所有策略，优先比较更精确的策略）
        if (action.data.locator && locatorConfig.strategies.length > 0) {
          const lastLocator = action.data.locator;
          const currentLocator = locatorConfig;
          
          // 优先比较更精确的策略（testid > placeholder > name > id）
          // 这些策略是唯一标识一个元素的最佳方式
          const priorityTypes = ['testid', 'placeholder', 'name', 'id'];
          
          let hasPriorityMatch = false;
          let priorityMatchResult = false;
          
          for (const priorityType of priorityTypes) {
            const lastStrategy = lastLocator.strategies.find((s: any) => s.type === priorityType);
            const currentStrategy = currentLocator.strategies.find((s: any) => s.type === priorityType);
            
            if (lastStrategy && currentStrategy) {
              // 如果都有相同类型的策略，比较值
              hasPriorityMatch = true;
              if (lastStrategy.value === currentStrategy.value) {
                priorityMatchResult = true;
                // 继续检查其他优先级策略，确保完全匹配
              } else {
                // 值不同，不是同一个元素
                return -1;
              }
            } else if (lastStrategy || currentStrategy) {
              // 只有一个有该策略，不是同一个元素（除非是动态ID的情况）
              if (priorityType === 'id') {
                // ID 可能是动态的，继续检查其他策略
                continue;
              }
              return -1;
            }
          }
          
          // 如果有优先级策略匹配，返回匹配结果
          if (hasPriorityMatch) {
            if (priorityMatchResult) {
              return i; // 找到匹配
            } else {
              return -1; // 优先级策略不匹配
            }
          }
          
          // 如果没有优先级策略，比较所有策略（必须完全匹配）
          // 但排除低优先级的策略（如 css, xpath），因为它们可能不够精确
          const lastHighPriorityStrategies = lastLocator.strategies.filter(
            (s: any) => s.priority && s.priority <= 6
          );
          const currentHighPriorityStrategies = currentLocator.strategies.filter(
            (s: any) => s.priority && s.priority <= 6
          );
          
          if (lastHighPriorityStrategies.length > 0 && currentHighPriorityStrategies.length > 0) {
            // 比较高优先级策略
            if (lastHighPriorityStrategies.length === currentHighPriorityStrategies.length) {
              let allMatch = true;
              for (let j = 0; j < lastHighPriorityStrategies.length; j++) {
                const lastStrategy = lastHighPriorityStrategies[j];
                const currentStrategy = currentHighPriorityStrategies[j];
                if (lastStrategy.type !== currentStrategy.type || 
                    lastStrategy.value !== currentStrategy.value) {
                  allMatch = false;
                  break;
                }
              }
              if (allMatch) {
                return i;
              }
            }
          }
          
          // 如果都没有高优先级策略，比较所有策略
          if (lastLocator.strategies.length === currentLocator.strategies.length && 
              lastLocator.strategies.length > 0) {
            let allMatch = true;
            for (let j = 0; j < lastLocator.strategies.length; j++) {
              const lastStrategy = lastLocator.strategies[j];
              const currentStrategy = currentLocator.strategies[j];
              if (lastStrategy.type !== currentStrategy.type || 
                  lastStrategy.value !== currentStrategy.value) {
                allMatch = false;
                break;
              }
            }
            if (allMatch) {
              return i;
            }
          }
        }
      }
    }
    return -1;
  }

  /**
   * 捕获悬停（改进版：优先识别菜单结构，自动检测父菜单）
   */
  private async captureHover(x: number, y: number): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    // 检查是否暂停
    if (this.recorderUI) {
      try {
        const paused = await this.recorderUI.isPaused();
        if (paused) {
          return;
        }
      } catch (error: any) {
        // 如果页面在检查过程中关闭，忽略错误并继续
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }
    
    // 生成定位器（包含菜单结构信息）
    const elementData = await this.page.evaluate((args: { x: number; y: number }) => {
      // @ts-ignore
      const getElementData = (window as any).__playwrightGetElementData;
      if (typeof getElementData === 'function') {
        return getElementData(args.x, args.y);
      }
      return null;
    }, { x, y });
    
    if (!elementData) {
      console.warn('⚠️ 无法获取元素数据，跳过悬停操作');
      return;
    }
    
    // 检测菜单结构
    const menuStructure = MenuDetector.detectMenuStructure(elementData);
    
    // 如果悬停的是子菜单项，自动检测父菜单并生成父菜单悬停步骤
    if (menuStructure.isChildMenuItem && menuStructure.parentMenu) {
      console.log(`✅ 检测到子菜单项悬停，自动添加父菜单悬停步骤: ${menuStructure.parentMenu.text}`);
      
      // 生成父菜单的定位策略
      const parentMenuStrategies = MenuDetector.generateParentMenuLocator(menuStructure.parentMenu);
      
      if (parentMenuStrategies.length > 0) {
        // 先添加父菜单悬停步骤
        const parentHoverAction: CapturedAction = {
          type: 'hover',
          timestamp: Date.now() - 100, // 稍微提前时间戳，确保在子菜单点击之前
          data: {
            x,
            y,
            locator: {
              strategies: parentMenuStrategies,
              description: `定位${menuStructure.parentMenu.text}父菜单并悬停`,
            },
            isParentMenuHover: true,
            menuStructure: menuStructure.parentMenu,
          },
        };
        
        this.capturedActions.push(parentHoverAction);
        
        // 更新 UI
        if (this.recorderUI) {
          await this.recorderUI.addAction({
            type: '悬停',
            details: `悬停${menuStructure.parentMenu.text}父菜单，展开子选项`,
            timestamp: parentHoverAction.timestamp,
          });
        }
        
        // 验证悬停有效性（可选，在录制时可能不需要）
        // 注意：这里不等待，因为录制时用户会手动操作
      }
    }
    
    // 生成当前元素的定位器
    let locatorConfig = await this.locatorGenerator.generateFromClick(x, y);
    if (!locatorConfig || locatorConfig.strategies.length === 0) {
      // 如果无法生成定位器，但检测到是菜单元素，尝试使用菜单结构生成
      if (menuStructure.isMenuElement && menuStructure.menuText) {
        locatorConfig = {
          strategies: [
            {
              type: 'text',
              value: menuStructure.menuText,
              priority: 6,
            },
          ],
          description: `定位菜单元素: ${menuStructure.menuText}`,
        };
      } else {
        // 如果无法生成定位器，至少使用坐标作为备选策略
        // 这样即使定位策略为空，也能记录悬停操作
        console.warn('⚠️ 无法为悬停操作生成定位器，使用坐标作为备选');
        locatorConfig = {
          strategies: [
            {
              type: 'xpath',
              value: `//*[@x="${x}" and @y="${y}"]`, // 占位符，实际不会使用
              priority: 10, // 最低优先级
            },
          ],
          description: `定位坐标 (${x}, ${y}) 处的元素`,
        };
      }
    }
    
    // 过滤无效的悬停定位（如空白区域、通用div等）
    // 但即使所有策略都被过滤掉，也不应该跳过悬停操作
    // 因为用户可能确实需要悬停在某个区域
    const validStrategies = locatorConfig.strategies.filter(s => {
      // 检查是否是弱定位（通用div、空白区域等）
      if (s.type === 'css') {
        const value = s.value || '';
        // 过滤掉通用选择器（如 div.el-col, div.el-row 等）
        if (value.match(/^(div|span|td|tr)\.(el-col|el-row|el-table)/)) {
          return false;
        }
        // 如果优先级很低（>= 7），且选择器很通用，认为无效
        if ((s.priority || 99) >= 7 && value.split('.').length <= 2) {
          return false;
        }
      }
      return true;
    });
    
    // 如果所有策略都被过滤掉，至少保留一个最低优先级的策略
    // 这样悬停操作仍然会被记录，即使定位策略不够精确
    if (validStrategies.length === 0) {
      console.warn('⚠️ 悬停定位策略无效（可能是空白区域），但保留悬停操作记录');
      // 保留原始策略中的第一个，即使它不够精确
      if (locatorConfig.strategies.length > 0) {
        validStrategies.push(locatorConfig.strategies[0]);
      }
    }
    
    // 更新定位器配置，只使用有效的策略
    locatorConfig.strategies = validStrategies;
    
    // 检查是否有相同定位器的上一个 hover 操作（在1秒内，视为重复悬停）
    const lastHoverIndex = this.findLastActionIndex('hover', locatorConfig, 1000);
    
    if (lastHoverIndex >= 0) {
      // 重复悬停，跳过不记录
      console.log('⚠️ 检测到重复悬停，已跳过');
      return;
    }
    
    const action: CapturedAction = {
      type: 'hover',
      timestamp: Date.now(),
      data: { 
        x, 
        y,
        locator: locatorConfig,
        menuStructure: menuStructure.isMenuElement ? menuStructure : undefined,
      },
    };
    
    this.capturedActions.push(action);

    // 更新 UI
    if (this.recorderUI) {
      const details = menuStructure.isParentMenu 
        ? `悬停${menuStructure.menuText || ''}父菜单，展开子选项`
        : `悬停在元素上`;
      await this.recorderUI.addAction({
        type: '悬停',
        details,
        timestamp: action.timestamp,
      });
    }
  }

  /**
   * 捕获按键
   */
  private async captureKeyPress(key: string, targetElement?: any): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    // 检查是否暂停
    if (this.recorderUI) {
      try {
        const paused = await this.recorderUI.isPaused();
        if (paused) {
          return;
        }
      } catch (error: any) {
        // 如果页面在检查过程中关闭，忽略错误并继续
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }
    
    // 记录按键时间（用于检测按键后的导航）
    this.lastKeyPressTime = Date.now();

    // 如果有目标元素，尝试生成定位器
    let locatorConfig: any = null;
    if (targetElement) {
      try {
        // 从目标元素获取坐标（如果可能）
        const rect = targetElement.getBoundingClientRect?.();
        if (rect) {
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          locatorConfig = await this.locatorGenerator.generateFromClick(x, y);
        }
      } catch (error) {
        // 如果生成定位器失败，继续执行（按键操作可以不依赖定位器）
        console.warn('⚠️ 无法为按键操作生成定位器:', error);
      }
    }
    
    // 如果没有定位器，尝试使用上一个 fill 操作的定位器（通常 Enter 键是在输入框上按的）
    if (!locatorConfig || locatorConfig.strategies.length === 0) {
      const lastFillAction = this.capturedActions
        .slice()
        .reverse()
        .find(action => action.type === 'fill');
      if (lastFillAction && lastFillAction.data.locator) {
        locatorConfig = lastFillAction.data.locator;
        console.log('✅ 使用上一个 fill 操作的定位器作为按键操作的定位器');
      }
    }

    const action: CapturedAction = {
      type: 'keypress',
      timestamp: this.lastKeyPressTime,
      data: { 
        key,
        locator: locatorConfig, // 记录定位器，用于执行时聚焦到正确的元素
      },
    };
    
    this.capturedActions.push(action);

    // 更新 UI
    if (this.recorderUI) {
      await this.recorderUI.addAction({
        type: '按键',
        details: `按下 ${key} 键${locatorConfig ? ' (在输入框上)' : ''}`,
        timestamp: action.timestamp,
      });
    }
  }

  /**
   * 捕获导航
   */
  private async captureNavigation(url: string): Promise<void> {
    // 检查页面是否已关闭
    if (this.page.isClosed()) {
      return;
    }
    
    // 检查是否暂停
    if (this.recorderUI) {
      try {
        const paused = await this.recorderUI.isPaused();
        if (paused) {
          return;
        }
      } catch (error: any) {
        // 如果页面在检查过程中关闭，忽略错误并继续
        if (error.message && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    }

    // 注意：点击导致的导航已经在 framenavigated 事件处理中被过滤了
    // 这里只处理其他情况的导航（如直接输入URL、刷新等）
    const action: CapturedAction = {
      type: 'navigate',
      timestamp: Date.now(),
      data: { url },
    };
    
    this.capturedActions.push(action);

    // 更新 UI
    if (this.recorderUI) {
      await this.recorderUI.addAction({
        type: '导航',
        details: `导航到 ${url}`,
        timestamp: action.timestamp,
      });
    }
  }

  /**
   * 获取捕获的操作
   */
  getCapturedActions(): CapturedAction[] {
    return this.capturedActions;
  }

  /**
   * 转换为测试步骤
   */
  async convertToTestSteps(): Promise<TestStep[]> {
    const steps: TestStep[] = [];

    for (const action of this.capturedActions) {
      const step = await this.convertActionToStep(action);
      if (step) {
        steps.push(step);
      }
    }

    return steps;
  }

  /**
   * 转换操作为测试步骤
   */
  private async convertActionToStep(action: CapturedAction): Promise<TestStep | null> {
    switch (action.type) {
      case 'click':
        const clickStep: TestStep = {
          action: 'click',
          locator: action.data.locator,
          description: '点击元素',
        };
        // 如果点击操作导致导航，记录目标URL（用于降级策略）
        if (action.data.expectedNavigation) {
          clickStep.targetUrl = action.data.expectedNavigation;
        }
        // 如果点击操作触发了对话框，记录对话框信息（用于执行时等待对话框出现）
        if (action.data.expectedDialog) {
          (clickStep as any).expectedDialog = action.data.expectedDialog;
        }
        return clickStep;
      case 'fill':
        return {
          action: 'fill',
          locator: action.data.locator,
          value: action.data.value,
          description: '填充输入',
        };
      case 'navigate':
        return {
          action: 'navigate',
          value: action.data.url,
          description: '导航到页面',
        };
      case 'keypress':
        const pressStep: TestStep = {
          action: 'press',
          value: action.data.key,
          locator: action.data.locator || undefined, // 记录定位器，用于执行时聚焦到正确的元素
          description: `按下 ${action.data.key} 键`,
        };
        // 如果按键操作导致导航，记录目标URL（用于降级策略）
        if (action.data.expectedNavigation) {
          pressStep.targetUrl = action.data.expectedNavigation;
        }
        return pressStep;
      case 'hover':
        return {
          action: 'hover',
          locator: action.data.locator,
          description: '悬停在元素上',
        };
      default:
        return null;
    }
  }

  /**
   * 清空捕获的操作
   */
  clear(): void {
    this.capturedActions = [];
  }
}
