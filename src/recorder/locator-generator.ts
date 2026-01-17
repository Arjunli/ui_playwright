import { Page, Locator } from '@playwright/test';
import type { LocatorStrategy, LocatorConfig, LocatorStrategyType } from '../types/test-config';

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  placeholder?: string;
  text?: string;
  role?: string;
  testId?: string;
  attributes: Record<string, string>;
}

/**
 * 智能定位生成器
 */
export class LocatorGenerator {
  private initScriptInjected = false;

  constructor(private page: Page) {}

  /**
   * 注入获取元素数据的全局函数
   */
  private async injectGetElementDataScript(): Promise<void> {
    const script = `
      (function() {
        if (window.__playwrightGetElementData) return;
        
        window.__playwrightGetElementData = function(x, y) {
          let el = document.elementFromPoint(x, y);
          if (!el) return null;
          
          // 优先查找可交互的元素（button、a、input 等）
          // 如果当前元素不是可交互的，向上查找直到找到可交互的元素
          let current = el;
          const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
          const maxDepth = 5; // 最多向上查找 5 层
          let depth = 0;
          
          while (current && depth < maxDepth) {
            const tagName = current.tagName.toLowerCase();
            // 如果是可交互元素，或者有 role="button" 等，使用它
            if (interactiveTags.includes(tagName) || 
                current.getAttribute('role') === 'button' ||
                current.getAttribute('role') === 'link' ||
                current.getAttribute('onclick') ||
                current.style.cursor === 'pointer') {
              el = current;
              break;
            }
            // 如果当前元素有明确的文本内容且较短（可能是按钮文本），也使用它
            const text = current.textContent?.trim() || '';
            if (text && text.length < 20 && (tagName === 'span' || tagName === 'div')) {
              // 检查是否是按钮的一部分（有父元素是 button）
              let parent = current.parentElement;
              let foundButton = false;
              while (parent && parent !== document.body) {
                if (parent.tagName.toLowerCase() === 'button' || 
                    parent.getAttribute('role') === 'button') {
                  el = parent;
                  foundButton = true;
                  break;
                }
                parent = parent.parentElement;
              }
              if (foundButton) break;
            }
            current = current.parentElement;
            depth++;
          }
          
          function getElementData(elem, depth) {
            depth = depth || 0;
            if (!elem || depth > 5) return null; // 增加深度以收集更多父元素信息
            
            const tagName = elem.tagName.toLowerCase();
            const id = elem.id;
            let className = '';
            if (elem.className) {
              if (typeof elem.className === 'string') {
                className = elem.className;
              } else {
                className = String(elem.className);
              }
            }
            // 对于按钮等元素，优先使用 innerText（只包含可见文本）
            // 对于其他元素，使用 textContent（包含所有文本，包括隐藏的）
            let text = '';
            if (interactiveTags.includes(elem.tagName.toLowerCase()) || 
                elem.getAttribute('role') === 'button') {
              // 对于按钮，使用 innerText 或 textContent（innerText 可能不可用）
              text = (elem.innerText && elem.innerText.trim()) || 
                     (elem.textContent && elem.textContent.trim()) || '';
            } else {
              text = (elem.textContent && elem.textContent.trim()) || '';
            }
            const role = elem.getAttribute('role');
            const testId = elem.getAttribute('data-testid');
            const ariaLabel = elem.getAttribute('aria-label');
            const title = elem.getAttribute('title');
            
            const attributes = {};
            for (let i = 0; i < elem.attributes.length; i++) {
              const attr = elem.attributes[i];
              attributes[attr.name] = attr.value;
            }
            
            // 提取 name 和 placeholder（对于输入框很重要）
            const name = elem.getAttribute('name') || undefined;
            const placeholder = elem.getAttribute('placeholder') || undefined;
            
            // 收集兄弟元素信息（用于兄弟节点定位）
            const siblings = [];
            if (elem.parentElement) {
              const parent = elem.parentElement;
              const children = Array.from(parent.children);
              const currentIndex = children.indexOf(elem);
              
              // 收集前一个和后一个兄弟元素（最多各2个）
              for (let i = Math.max(0, currentIndex - 2); i < Math.min(children.length, currentIndex + 3); i++) {
                if (i !== currentIndex) {
                  const sibling = children[i];
                  const siblingTag = sibling.tagName ? sibling.tagName.toLowerCase() : '';
                  let siblingClass = '';
                  if (sibling.className) {
                    if (typeof sibling.className === 'string') {
                      siblingClass = sibling.className;
                    } else {
                      siblingClass = String(sibling.className);
                    }
                  }
                  const siblingText = (sibling.textContent && sibling.textContent.trim()) || '';
                  
                  // 只保存有意义的兄弟元素（有文本或class）
                  if (siblingText.length < 30 || siblingClass.length > 0) {
                    siblings.push({
                      tagName: siblingTag,
                      className: siblingClass.split(/\\s+/)[0] || undefined,
                      text: siblingText.length < 30 ? siblingText : undefined,
                      position: i < currentIndex ? 'preceding' : 'following'
                    });
                  }
                }
              }
            }
            
            return {
              tagName: tagName,
              id: id,
              className: className,
              name: name,
              placeholder: placeholder,
              text: text,
              role: role || undefined,
              testId: testId || undefined,
              ariaLabel: ariaLabel || undefined,
              title: title || undefined,
              attributes: attributes,
              parent: depth < 5 ? getElementData(elem.parentElement, depth + 1) : null, // 增加深度
              siblings: siblings.length > 0 ? siblings : undefined // 兄弟元素信息
            };
          }
          
          const elementData = getElementData(el, 0);
          
          // 收集父菜单信息（在浏览器端完成，避免序列化问题）
          if (elementData) {
            // 从实际 DOM 元素开始收集父菜单信息
            let current = el.parentElement;
            const parentMenuInfo = [];
            let depth = 0;
            while (current && depth < 5 && current !== document.body) {
              const tagName = current.tagName ? current.tagName.toLowerCase() : '';
              let className = '';
              if (current.className) {
                if (typeof current.className === 'string') {
                  className = current.className;
                } else {
                  className = String(current.className);
                }
              }
              const text = (current.textContent && current.textContent.trim()) || '';
              
              // 检查是否是菜单相关的父元素
              if (tagName.includes('menu') || 
                  className.includes('menu') ||
                  className.includes('sub-menu')) {
                const firstClass = className.split(/\\s+/)[0];
                parentMenuInfo.push({
                  tagName: tagName,
                  className: firstClass || undefined, // 只取第一个 class
                  text: text.length < 30 ? text : undefined, // 只保存短文本
                  id: current.id || undefined,
                });
              }
              current = current.parentElement;
              depth++;
            }
            
            if (parentMenuInfo.length > 0) {
              elementData.parentMenuInfo = parentMenuInfo;
            }
          }
          
          return elementData;
        };
      })();
    `;
    
    await this.page.addInitScript(script);
    // 如果页面已加载，立即执行
    try {
      await this.page.evaluate(script);
    } catch {
      // 忽略错误，页面可能还未加载
    }
  }

  /**
   * 从元素生成定位策略
   * 使用新的 StrategyGenerator（参考八爪鱼架构）
   */
  async generateLocatorStrategies(selector: string): Promise<LocatorConfig> {
    const element = this.page.locator(selector).first();
    const elementInfo = await this.getElementInfo(element);
    
    // 使用新的 StrategyGenerator
    const { StrategyGenerator } = await import('../core/strategy-generator');
    const generator = new StrategyGenerator();
    
    // 收集父元素和兄弟元素信息
    const parentInfo = await this.getParentInfo(element);
    const siblings = await this.getSiblingsInfo(element);
    
    return generator.generateStrategies(elementInfo, parentInfo, siblings);
  }

  /**
   * 获取父元素信息（用于生成相对XPath）
   */
  private async getParentInfo(element: any): Promise<any> {
    try {
      return await element.evaluate((el: HTMLElement) => {
        const parent = el.parentElement;
        if (!parent) return null;
        
        return {
          tagName: parent.tagName.toLowerCase(),
          className: parent.className || '',
          text: (parent.textContent || '').trim().substring(0, 30)
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * 获取兄弟元素信息（用于生成基于兄弟节点的XPath）
   */
  private async getSiblingsInfo(element: any): Promise<any[]> {
    try {
      return await element.evaluate((el: HTMLElement) => {
        if (!el.parentElement) return [];
        
        const siblings: any[] = [];
        const parent = el.parentElement;
        const children = Array.from(parent.children);
        const currentIndex = children.indexOf(el);
        
        // 收集前一个和后一个兄弟元素
        for (let i = Math.max(0, currentIndex - 2); i < Math.min(children.length, currentIndex + 3); i++) {
          if (i !== currentIndex) {
            const sibling = children[i] as HTMLElement;
            const siblingClass = sibling.className || '';
            const siblingText = (sibling.textContent || '').trim();
            
            if (siblingText.length < 30 || siblingClass.length > 0) {
              siblings.push({
                tagName: sibling.tagName.toLowerCase(),
                className: siblingClass.split(/\s+/)[0] || undefined,
                text: siblingText.length < 30 ? siblingText : undefined,
                position: i < currentIndex ? 'preceding' : 'following'
              });
            }
          }
        }
        
        return siblings;
      });
    } catch {
      return [];
    }
  }

  /**
   * 旧版生成方法（保留兼容性，但已废弃）
   * @deprecated 使用 StrategyGenerator 代替
   */
  private async generateLocatorStrategiesLegacy(selector: string): Promise<LocatorConfig> {
    const element = this.page.locator(selector).first();
    const elementInfo = await this.getElementInfo(element);

    const strategies: LocatorStrategy[] = [];

    // 1. data-testid (最稳定)
    if (elementInfo.testId) {
      strategies.push({
        type: 'testid',
        value: elementInfo.testId,
        priority: 1,
      });
    }

    // 2. id
    if (elementInfo.id) {
      strategies.push({
        type: 'id',
        value: elementInfo.id,
        priority: 2,
      });
    }

    // 3. role + name (语义化)
    if (elementInfo.role) {
      strategies.push({
        type: 'role',
        value: elementInfo.role,
        name: elementInfo.text || elementInfo.name,
        priority: 3,
      });
    }

    // 4. name 属性
    if (elementInfo.name) {
      strategies.push({
        type: 'name',
        value: elementInfo.name,
        priority: 4,
      });
    }

    // 5. placeholder
    if (elementInfo.placeholder) {
      strategies.push({
        type: 'placeholder',
        value: elementInfo.placeholder,
        priority: 5,
      });
    }

    // 6. XPath (基于元素属性，优先于 CSS 和 text)
    // XPath 通常比 CSS 更精确，特别是当使用元素属性（id、name、class等）时
    // 优先级设置为 5.8，高于 CSS (7) 和 text (6)，但低于元素属性定位（testid、id、name等）
    // 这样可以优先使用元素属性进行定位，而不是依赖 CSS 选择器
    const xpath = this.generateXPath(elementInfo);
    if (xpath) {
      strategies.push({
        type: 'xpath',
        value: xpath,
        priority: 5.8,
      });
    }

    // 7. text 内容（优先级低于 XPath，因为文本可能变化）
    if (elementInfo.text && elementInfo.text.trim().length > 0 && elementInfo.text.trim().length < 50) {
      strategies.push({
        type: 'text',
        value: elementInfo.text.trim(),
        priority: 6,
      });
    }

    // 8. CSS 选择器（最后备选，因为可能不够精确）
    const cssSelector = this.generateCssSelector(elementInfo);
    if (cssSelector) {
      strategies.push({
        type: 'css',
        value: cssSelector,
        priority: 7,
      });
    }

    // 按优先级排序
    strategies.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    return {
      strategies,
      description: `定位 ${elementInfo.tagName} 元素`,
    };
  }

  /**
   * 从点击事件生成定位策略
   */
  async generateFromClick(x: number, y: number): Promise<LocatorConfig | null> {
    try {
      // 确保脚本已注入（只注入一次）
      if (!this.initScriptInjected) {
        await this.injectGetElementDataScript();
        this.initScriptInjected = true;
      }
      
      // 调用已注入的全局函数，同时收集父元素信息（用于生成更精确的定位策略）
      const elementData: any = await this.page.evaluate(
        (args: { x: number; y: number }) => {
          // @ts-ignore - 全局函数在运行时存在
          const getElementData = (window as any).__playwrightGetElementData;
          if (typeof getElementData === 'function') {
            const data = getElementData(args.x, args.y);
            if (!data) return null;
            
            // 收集父元素信息（特别是菜单结构）
            // 查找父菜单项（el-sub-menu, el-menu-item 等）
            let current = data.parent;
            const parentMenuInfo: any[] = [];
            let depth = 0;
            while (current && depth < 5) {
              const tagName = current.tagName?.toLowerCase() || '';
              const className = current.className || '';
              const text = current.text?.trim() || '';
              
              // 检查是否是菜单相关的父元素
              if (tagName.includes('menu') || 
                  className.includes('menu') ||
                  className.includes('sub-menu')) {
                parentMenuInfo.push({
                  tagName,
                  className,
                  text: text.length < 30 ? text : undefined, // 只保存短文本
                  id: current.id || undefined,
                });
              }
              current = current.parent;
              depth++;
            }
            
            return {
              ...data,
              parentMenuInfo: parentMenuInfo.length > 0 ? parentMenuInfo : undefined,
            };
          }
          return null;
        },
        { x, y }
      );

      if (!elementData) {
        return null;
      }

      // 转换为 ElementInfo 格式
      // 从 attributes 中提取 name 和 placeholder
      const name = elementData.attributes?.name || elementData.name;
      const placeholder = elementData.attributes?.placeholder || elementData.placeholder;
      
      const elementInfo: ElementInfo = {
        tagName: elementData.tagName,
        id: elementData.id || undefined,
        className: elementData.className || undefined,
        name: name || undefined,
        placeholder: placeholder || undefined,
        text: elementData.text || undefined,
        role: elementData.role,
        testId: elementData.testId,
        attributes: elementData.attributes,
      };

      // 如果当前元素没有可用的定位策略，尝试使用父元素
      let locatorConfig = this.generateLocatorConfigFromInfo(elementInfo, elementData.parent);
      
      // 如果有父菜单信息，生成更精确的定位策略（结合父菜单路径）
      if (elementData.parentMenuInfo && elementData.parentMenuInfo.length > 0) {
        // 对于菜单项，生成包含父菜单路径的定位策略
        const parentMenu = elementData.parentMenuInfo[0]; // 使用最近的父菜单
        if (parentMenu.text && elementInfo.text) {
          // 转义文本中的特殊字符
          const escapeText = (text: string) => text.replace(/"/g, '\\"').replace(/'/g, "\\'");
          const parentText = escapeText(parentMenu.text);
          const childText = escapeText(elementInfo.text);
          
          // 生成更精确的 CSS 选择器：父菜单 > 子菜单项
          const parentClass = parentMenu.className ? parentMenu.className.split(/\s+/)[0] : null;
          const parentSelector = parentClass 
            ? `${parentMenu.tagName}.${parentClass}:has-text("${parentText}")`
            : `${parentMenu.tagName}:has-text("${parentText}")`;
          
          const childClass = elementInfo.className ? elementInfo.className.split(/\s+/)[0] : null;
          const childSelector = childClass
            ? `${elementInfo.tagName}.${childClass}:has-text("${childText}")`
            : `${elementInfo.tagName}:has-text("${childText}")`;
          
          const combinedCss = `${parentSelector} > ${childSelector}`;
          // 将组合选择器插入到策略列表的前面（高优先级）
          locatorConfig.strategies.unshift({
            type: 'css',
            value: combinedCss,
            priority: 5.5, // 优先级高于普通 CSS，但低于 text
          });
        }
      }
      
      // 检查当前元素是否是可交互元素
      const isInteractiveElement = ['button', 'a', 'input', 'select', 'textarea'].includes(elementInfo.tagName) ||
                                   elementInfo.role === 'button' || elementInfo.role === 'link';
      
      // 检查当前策略的质量（是否有高优先级策略）
      const hasHighPriorityStrategy = locatorConfig.strategies.some(s => (s.priority || 99) < 7);
      
      // 只有在以下情况才使用父元素：
      // 1. 当前元素不是可交互元素
      // 2. 策略为空，或者只有低优先级策略（如 div.el-col）
      // 3. 父元素存在
      if (!isInteractiveElement && 
          (locatorConfig.strategies.length === 0 || !hasHighPriorityStrategy) && 
          elementData.parent) {
        const parentInfo: ElementInfo = {
          tagName: elementData.parent.tagName,
          id: elementData.parent.id || undefined,
          className: elementData.parent.className || undefined,
          name: undefined,
          placeholder: undefined,
          text: elementData.parent.text || undefined,
          role: elementData.parent.role,
          testId: elementData.parent.testId,
          attributes: elementData.parent.attributes,
        };
        
        const parentConfig = this.generateLocatorConfigFromInfo(parentInfo);
        // 只有当父元素有更好的策略时才使用
        const parentHasBetterStrategy = parentConfig.strategies.some(s => (s.priority || 99) < 7);
        if (parentConfig.strategies.length > 0 && (parentHasBetterStrategy || locatorConfig.strategies.length === 0)) {
          // 使用父元素的定位策略，但添加子元素选择器
          locatorConfig = {
            strategies: parentConfig.strategies.map(strategy => ({
              ...strategy,
              // 在 CSS 选择器后添加子元素选择器
              value: strategy.type === 'css' 
                ? `${strategy.value} > ${elementInfo.tagName}` 
                : strategy.value
            })),
            description: `定位 ${elementInfo.tagName} 元素（通过父元素）`,
          };
        }
      }

      return locatorConfig;
    } catch (error) {
      console.error('生成定位策略失败:', error);
      return null;
    }
  }

  /**
   * 获取元素信息
   */
  private async getElementInfo(locator: Locator): Promise<ElementInfo> {
    return await locator.evaluate((el) => {
      const attributes: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attributes[attr.name] = attr.value;
      }

      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className?.toString() || undefined,
        name: (el as HTMLInputElement).name || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        text: el.textContent?.trim() || undefined,
        role: el.getAttribute('role') || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        attributes,
      };
    });
  }

  /**
   * 从 ElementHandle 获取元素信息
   */
  private async getElementInfoFromHandle(handle: any): Promise<ElementInfo> {
    return await handle.evaluate((el: Element) => {
      const attributes: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attributes[attr.name] = attr.value;
      }

      // 正确处理 className（可能是字符串或 DOMTokenList）
      let className: string | undefined = undefined;
      if (el.className) {
        if (typeof el.className === 'string') {
          className = el.className;
        } else {
          // 可能是 DOMTokenList 或其他对象，尝试转换为字符串
          try {
            className = String(el.className);
            // 如果转换后包含 [object，说明是对象，改用 class 属性
            if (className.includes('[object')) {
              className = el.getAttribute('class') || undefined;
            }
          } catch {
            // 如果转换失败，使用 class 属性
            className = el.getAttribute('class') || undefined;
          }
        }
      }

      // 获取 role（优先使用显式 role，否则推断）
      let role = el.getAttribute('role');
      if (!role) {
        // 推断 role
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'button') {
          role = 'button';
        } else if (tagName === 'a' && el.getAttribute('href')) {
          role = 'link';
        } else if (tagName === 'input') {
          const inputType = (el as HTMLInputElement).type;
          if (inputType === 'button' || inputType === 'submit') {
            role = 'button';
          }
        }
      }

      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: className,
        name: (el as HTMLInputElement).name || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        text: el.textContent?.trim() || undefined,
        role: role || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        attributes,
      };
    });
  }

  /**
   * 从元素信息生成定位配置
   */
  /**
   * 从元素信息生成定位配置
   * 参考 DeploySentinel Recorder 的最佳实践：优先使用稳定的属性
   * @param elementInfo 元素信息
   * @param parentInfo 父元素信息（可选，用于生成相对XPath）
   * @param siblings 兄弟元素信息（可选，用于生成基于兄弟节点的XPath）
   */
  private generateLocatorConfigFromInfo(elementInfo: ElementInfo, parentInfo?: any, siblings?: any[]): LocatorConfig {
    const strategies: LocatorStrategy[] = [];

    // 检查 ID 是否是动态生成的（包含随机数字）
    const hasDynamicId = elementInfo.id && /el-id-\d+-\d+/.test(elementInfo.id);

    // 1. data-testid (最高优先级，最稳定)
    if (elementInfo.testId) {
      strategies.push({ type: 'testid', value: elementInfo.testId, priority: 1 });
    }
    
    // 2. placeholder (对于输入框非常稳定)
    if (elementInfo.placeholder) {
      strategies.push({ type: 'placeholder', value: elementInfo.placeholder, priority: 2 });
    }
    
    // 3. name (表单元素的稳定标识)
    if (elementInfo.name) {
      strategies.push({ type: 'name', value: elementInfo.name, priority: 3 });
    }
    
    // 4. role (可访问性属性，相对稳定)
    // 对于对话框，避免使用过长的文本作为 name（可能包含整个对话框内容）
    if (elementInfo.role) {
      let roleName = elementInfo.text;
      // 如果是对话框，且文本过长（> 50 字符），不使用文本作为 name
      if (elementInfo.role === 'dialog' && roleName && roleName.length > 50) {
        roleName = undefined; // 对话框不需要 name，CSS 选择器更可靠
      }
      // 对于其他 role，如果文本过长（> 50 字符），也不使用
      else if (roleName && roleName.length > 50) {
        roleName = undefined;
      }
      strategies.push({ type: 'role', value: elementInfo.role, name: roleName, priority: 4 });
    }
    
    // 5. id (只有在不是动态ID时才使用)
    if (elementInfo.id && !hasDynamicId) {
      strategies.push({ type: 'id', value: elementInfo.id, priority: 5 });
    }
    
    // 6. text (对于按钮、链接等元素，但避免使用过长的文本)
    if (elementInfo.text && elementInfo.text.length < 50 && elementInfo.text.trim().length > 0) {
      strategies.push({ type: 'text', value: elementInfo.text.trim(), priority: 6 });
    }

    // 7. CSS selector (基于 class 或其他属性)
    const cssSelector = this.generateCssSelector(elementInfo);
    if (cssSelector) {
      // 如果元素有文本内容，生成更精确的 CSS 选择器（使用 :has-text()）
      // 这对于菜单项等有多个相同 class 的元素特别有用
      if (elementInfo.text && elementInfo.text.length < 50 && elementInfo.text.trim().length > 0) {
        // 转义文本中的特殊字符
        const escapeText = (text: string) => text.replace(/"/g, '\\"').replace(/'/g, "\\'");
        const text = escapeText(elementInfo.text.trim());
        // 生成带文本的 CSS 选择器（更精确）
        const preciseCss = `${cssSelector}:has-text("${text}")`;
        strategies.push({ type: 'css', value: preciseCss, priority: 6.5 }); // 优先级介于 text 和 css 之间
      }
      // 总是添加基础CSS选择器（包括div.cell这样的选择器）
      strategies.push({ type: 'css', value: cssSelector, priority: 7 });
    }

    // 8. XPath (优先于 CSS，但不使用动态 ID)
    // XPath 通常比 CSS 更精确，特别是相对 XPath 和基于兄弟节点的 XPath
    // 如果 ID 是动态的，不使用 XPath（因为 ID 会变化）
    if (!hasDynamicId) {
      // 尝试生成相对XPath（如果有父元素信息或兄弟元素信息）
      const xpath = this.generateXPath(elementInfo, parentInfo, siblings);
      if (xpath) {
        // XPath 优先级设置为 6.8，高于 CSS (7)
        // 如果使用了兄弟节点定位，优先级更高（6.5），高于带文本的 CSS (6.5)
        const priority = siblings && siblings.length > 0 ? 6.5 : 6.8;
        strategies.push({ type: 'xpath', value: xpath, priority });
      }
    }
    
    // 9. 计算元素指纹（用于调试和稳定性评估）
    const fingerprint = this.calculateElementFingerprint(elementInfo);
    // 将指纹信息附加到描述中（可选，用于调试）
    if (fingerprint.stability > 5) {
      // 高稳定性元素，可以在描述中标注
      // description += ` [稳定性: ${fingerprint.stability}]`;
    }

    // 如果没有任何策略，至少生成一个基于 tagName 的 CSS 选择器作为备选
    if (strategies.length === 0) {
      strategies.push({ 
        type: 'css', 
        value: elementInfo.tagName, 
        priority: 99 
      });
    }

    // 按优先级排序
    strategies.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    // 生成描述信息
    let description = `定位 ${elementInfo.tagName} 元素`;
    if (elementInfo.placeholder) {
      description += ` (placeholder: "${elementInfo.placeholder}")`;
    } else if (elementInfo.name) {
      description += ` (name: "${elementInfo.name}")`;
    } else if (elementInfo.testId) {
      description += ` (testid: "${elementInfo.testId}")`;
    }

    return {
      strategies,
      description,
    };
  }

  /**
   * 生成 CSS 选择器
   */
  private generateCssSelector(elementInfo: ElementInfo): string | null {
    // 如果 ID 是动态的，跳过
    if (elementInfo.id && !/el-id-\d+-\d+/.test(elementInfo.id)) {
      return `#${elementInfo.id}`;
    }

    // 处理 className（确保是字符串且有效）
    if (elementInfo.className && typeof elementInfo.className === 'string') {
      const classes = elementInfo.className.split(/\s+/).filter(c => {
        // 过滤掉空字符串、包含[object的无效类名
        return c.length > 0 && 
               !c.includes('[') && 
               !c.includes('object') &&
               !c.includes('undefined') &&
               !c.includes('null');
      });
      if (classes.length > 0) {
        // 转义特殊字符
        const firstClass = classes[0].replace(/[.#:\[\]()]/g, '\\$&');
        // 确保返回的是 tagName.className 格式（如 div.cell）
        return `${elementInfo.tagName}.${firstClass}`;
      }
    }
    
    // 如果className为空或无效，尝试从attributes中获取
    if (!elementInfo.className && elementInfo.attributes && elementInfo.attributes.class) {
      const classAttr = elementInfo.attributes.class;
      if (typeof classAttr === 'string' && classAttr.trim().length > 0) {
        const classes = classAttr.split(/\s+/).filter(c => {
          return c.length > 0 && 
                 !c.includes('[') && 
                 !c.includes('object') &&
                 !c.includes('undefined') &&
                 !c.includes('null');
        });
        if (classes.length > 0) {
          const firstClass = classes[0].replace(/[.#:\[\]()]/g, '\\$&');
          return `${elementInfo.tagName}.${firstClass}`;
        }
      }
    }

    // 如果只有 tagName，且是常见元素，直接返回
    // 对于 SVG 元素（如 path），不生成简单的 CSS 选择器，因为不够精确
    if (elementInfo.tagName === 'path' || elementInfo.tagName === 'svg' || elementInfo.tagName === 'g') {
      return null; // 不生成无效的 CSS 选择器
    }

    return `${elementInfo.tagName}`;
  }

  /**
   * 生成 XPath（优先使用相对路径和兄弟节点定位）
   */
  private generateXPath(elementInfo: ElementInfo, parentInfo?: any, siblings?: any[]): string | null {
    // 检查 ID 是否是动态生成的（包含随机数字）
    const hasDynamicId = elementInfo.id && /el-id-\d+-\d+/.test(elementInfo.id);
    
    // 1. 优先使用 ID（如果不是动态的）
    if (elementInfo.id && !hasDynamicId) {
      return `//*[@id="${elementInfo.id}"]`;
    }

    // 2. 使用 name 属性
    if (elementInfo.name) {
      return `//${elementInfo.tagName}[@name="${elementInfo.name}"]`;
    }

    // 3. 如果有兄弟元素信息，生成基于兄弟节点的XPath（参考八爪鱼的兄弟节点定位）
    if (siblings && siblings.length > 0) {
      // 优先使用前一个兄弟元素（更稳定）
      const precedingSibling = siblings.find(s => s.position === 'preceding' && (s.text || s.className));
      if (precedingSibling) {
        let siblingSelector = '';
        if (precedingSibling.className) {
          siblingSelector = `${precedingSibling.tagName}[@class="${precedingSibling.className}"]`;
        } else if (precedingSibling.text) {
          const escapedText = precedingSibling.text.replace(/"/g, '\\"').replace(/'/g, "\\'");
          siblingSelector = `${precedingSibling.tagName}[text()="${escapedText}"]`;
        } else {
          siblingSelector = precedingSibling.tagName;
        }
        
        // 构建目标元素选择器
        let targetSelector = '';
        if (elementInfo.className) {
          const firstClass = elementInfo.className.split(/\s+/)[0];
          targetSelector = `${elementInfo.tagName}[@class="${firstClass}"]`;
        } else if (elementInfo.text && elementInfo.text.length <= 50) {
          const escapedText = elementInfo.text.trim().replace(/"/g, '\\"').replace(/'/g, "\\'");
          targetSelector = `${elementInfo.tagName}[text()="${escapedText}"]`;
        } else {
          targetSelector = elementInfo.tagName;
        }
        
        // 生成基于兄弟节点的XPath：//兄弟元素/following-sibling::目标元素
        return `//${siblingSelector}/following-sibling::${targetSelector}[1]`;
      }
    }
    
    // 4. 如果有父元素信息，生成相对XPath（参考八爪鱼的相对路径定位）
    if (parentInfo) {
      const parentTag = parentInfo.tagName || '';
      const parentClass = parentInfo.className ? parentInfo.className.split(/\s+/)[0] : null;
      const parentText = parentInfo.text && parentInfo.text.length < 30 ? parentInfo.text.trim() : null;
      
      // 构建父元素选择器
      let parentSelector = '';
      if (parentClass) {
        // 转义class中的特殊字符
        const escapedClass = parentClass.replace(/"/g, '\\"').replace(/'/g, "\\'");
        parentSelector = `${parentTag}[@class="${escapedClass}"]`;
      } else if (parentText) {
        const escapedParentText = parentText.replace(/"/g, '\\"').replace(/'/g, "\\'");
        parentSelector = `${parentTag}[text()="${escapedParentText}"]`;
      } else {
        parentSelector = parentTag;
      }
      
      // 构建子元素选择器
      let childSelector = '';
      if (elementInfo.className) {
        const firstClass = elementInfo.className.split(/\s+/)[0];
        // 转义class中的特殊字符
        const escapedClass = firstClass.replace(/"/g, '\\"').replace(/'/g, "\\'");
        childSelector = `${elementInfo.tagName}[@class="${escapedClass}"]`;
      } else if (elementInfo.text && elementInfo.text.length <= 50) {
        const escapedText = elementInfo.text.trim().replace(/"/g, '\\"').replace(/'/g, "\\'");
        childSelector = `${elementInfo.tagName}[text()="${escapedText}"]`;
      } else {
        childSelector = elementInfo.tagName;
      }
      
      // 生成相对XPath：//父元素//子元素
      // 使用 descendant 而不是 // 更精确（只匹配直接或间接子元素）
      return `//${parentSelector}//${childSelector}`;
    }

    // 5. 对于文本，只使用短文本（避免包含表格数据等长文本）
    // 如果文本太长（> 50 字符），不使用文本生成 XPath
    if (elementInfo.text && elementInfo.text.length <= 50 && elementInfo.text.trim().length > 0) {
      // 转义 XPath 中的特殊字符
      const escapedText = elementInfo.text
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");
      return `//${elementInfo.tagName}[text()="${escapedText}"]`;
    }

    return null;
  }

  /**
   * 计算元素指纹（参考八爪鱼的元素指纹识别）
   * 结合多个属性生成唯一标识，评估稳定性
   */
  private calculateElementFingerprint(elementInfo: ElementInfo): {
    fingerprint: string;
    stability: number;
    attributes: string[];
  } {
    const attributes: string[] = [];
    let stability = 0;
    
    // 1. testid（最稳定，+10分）
    if (elementInfo.testId) {
      attributes.push(`data-testid="${elementInfo.testId}"`);
      stability += 10;
    }
    
    // 2. id（如果不是动态的，+8分）
    if (elementInfo.id && !/el-id-\d+-\d+/.test(elementInfo.id)) {
      attributes.push(`id="${elementInfo.id}"`);
      stability += 8;
    }
    
    // 3. name（+7分）
    if (elementInfo.name) {
      attributes.push(`name="${elementInfo.name}"`);
      stability += 7;
    }
    
    // 4. placeholder（+6分）
    if (elementInfo.placeholder) {
      attributes.push(`placeholder="${elementInfo.placeholder}"`);
      stability += 6;
    }
    
    // 5. role（+5分）
    if (elementInfo.role) {
      attributes.push(`role="${elementInfo.role}"`);
      stability += 5;
    }
    
    // 6. className（如果稳定，+4分；如果包含动态类名，+2分）
    if (elementInfo.className) {
      // 确保 className 是字符串（可能是数组或其他类型）
      const classNameStr = typeof elementInfo.className === 'string' 
        ? elementInfo.className 
        : (Array.isArray(elementInfo.className) 
          ? elementInfo.className.join(' ') 
          : String(elementInfo.className || ''));
      const classes = classNameStr.split(/\s+/);
      const stableClasses = classes.filter(c => 
        !c.includes('el-id-') && 
        !/\d{4,}/.test(c) && // 不包含长数字
        c.length > 2 // 长度合理
      );
      if (stableClasses.length > 0) {
        attributes.push(`class="${stableClasses[0]}"`);
        stability += stableClasses.length === classes.length ? 4 : 2;
      }
    }
    
    // 7. text（短文本，+3分）
    if (elementInfo.text && elementInfo.text.length < 30 && elementInfo.text.trim().length > 0) {
      attributes.push(`text="${elementInfo.text.trim()}"`);
      stability += 3;
    }
    
    // 8. tagName（基础，+1分）
    attributes.push(`tag="${elementInfo.tagName}"`);
    stability += 1;
    
    // 生成指纹字符串
    const fingerprint = attributes.join('|');
    
    return {
      fingerprint,
      stability,
      attributes,
    };
  }

  /**
   * 评估定位策略的稳定性
   */
  evaluateStability(strategy: LocatorStrategy): number {
    const stabilityScores: Record<LocatorStrategyType, number> = {
      testid: 10,
      id: 9,
      role: 8,
      name: 7,
      placeholder: 6,
      text: 5,
      css: 4,
      xpath: 3,
    };

    return stabilityScores[strategy.type] || 0;
  }

  /**
   * 评估定位策略的唯一性
   */
  async evaluateUniqueness(strategy: LocatorStrategy): Promise<number> {
    try {
      const count = await this.page.locator(this.strategyToSelector(strategy)).count();
      return count === 1 ? 10 : count === 0 ? 0 : 5 / count;
    } catch {
      return 0;
    }
  }

  /**
   * 将定位策略转换为选择器
   */
  strategyToSelector(strategy: LocatorStrategy): string {
    switch (strategy.type) {
      case 'testid':
        return `[data-testid="${strategy.value}"]`;
      case 'id':
        return `#${strategy.value}`;
      case 'role':
        if (strategy.name) {
          return `role=${strategy.value}[name="${strategy.name}"]`;
        }
        return `role=${strategy.value}`;
      case 'name':
        return `[name="${strategy.value}"]`;
      case 'placeholder':
        return `[placeholder="${strategy.value}"]`;
      case 'text':
        return `text="${strategy.value}"`;
      case 'css':
        return strategy.value;
      case 'xpath':
        return strategy.value;
      default:
        return strategy.value;
    }
  }
}
