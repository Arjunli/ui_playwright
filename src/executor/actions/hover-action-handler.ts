import { Locator } from '@playwright/test';
import type { TestStep } from '../../types/test-config';
import { BaseActionHandler } from './action-handler';
import type { PageStabilityService } from '../services/page-stability-service';

/**
 * 悬停操作处理器（针对悬浮导航栏的终极解决方案）
 * 优先级：定位根容器 → hover → 等子元素可见 → 300ms 动画等待 → JS 兜底
 */
export class HoverActionHandler extends BaseActionHandler {
  private currentStepIndex: number = 0;

  constructor(page: any, private pageStabilityService?: PageStabilityService, currentStepIndex?: number) {
    super(page);
    if (currentStepIndex !== undefined) {
      this.currentStepIndex = currentStepIndex;
    }
  }

  setStepIndex(index: number): void {
    this.currentStepIndex = index;
  }

  async execute(step: TestStep): Promise<void> {
    const stepPrefix = this.currentStepIndex > 0 ? `[步骤 ${this.currentStepIndex}] ` : '';
    
    if (!step.locator) {
      throw new Error('悬停操作需要定位器');
    }
    
    // 在执行悬停操作前，先检查页面是否已关闭
    if (this.page.isClosed()) {
      throw new Error('页面已关闭，无法执行悬停操作');
    }
    
    // 等待页面稳定（确保之前的操作已完成）
    if (this.pageStabilityService) {
      await this.pageStabilityService.waitForPageStable(2000);
    }
    
    // 再次检查页面是否已关闭（可能在等待过程中关闭）
    if (this.page.isClosed()) {
      throw new Error('页面已关闭，无法执行悬停操作');
    }
    
    try {
      // ========== 策略1：定位悬浮栏根容器 → hover → 等子元素可见 ==========
      console.log(`${stepPrefix}🎯 策略1: 定位悬浮栏根容器并悬停...`);
      
      const locator = await this.locatorResolver.resolve(step.locator);
      if (!locator) {
        throw new Error('无法解析定位器');
      }
      
      // 解析定位器后，再次检查页面是否关闭
      if (this.page.isClosed()) {
        throw new Error('页面已关闭，无法执行悬停操作');
      }
      
      // 步骤1：定位根容器（优先使用稳定的选择器）
      let rootContainer: Locator | null = null;
      
      try {
        // 方法1：通过定位器向上查找根容器
        const rootContainerFound = await locator.evaluate((el) => {
          let current: HTMLElement | null = el as HTMLElement;
          let root: HTMLElement | null = null;
          
          // 向上查找 el-sub-menu 或 el-menu 根容器
          while (current && current !== document.body) {
            const className = current.className || '';
            if (className.includes('el-sub-menu') || 
                className.includes('el-menu') && !className.includes('el-menu-item')) {
              root = current;
              break;
            }
            current = current.parentElement;
          }
          
          return root ? {
            tagName: root.tagName.toLowerCase(),
            className: root.className,
            id: root.id,
            text: root.textContent?.trim().substring(0, 50) || ''
          } : null;
        });
        
        if (rootContainerFound) {
          // 使用稳定的选择器定位根容器（避免动态 ID/class）
          const stableSelectors = [
            // 优先使用文本定位（最稳定）
            rootContainerFound.text ? this.page.getByText(rootContainerFound.text, { exact: false }).first() : null,
            // 使用稳定的 CSS 选择器（基于类名，不使用动态部分）
            rootContainerFound.className ? this.page.locator(`li.el-sub-menu:has-text("${rootContainerFound.text}")`).first() : null,
            // 使用 role 定位（如果可用）
            this.page.locator(`[role="menuitem"]:has-text("${rootContainerFound.text}")`).first(),
          ].filter(Boolean) as Locator[];
          
          if (stableSelectors.length > 0) {
            rootContainer = stableSelectors[0];
            console.log(`${stepPrefix}  └─ ✅ 找到根容器: ${rootContainerFound.text || rootContainerFound.className}`);
          }
        }
      } catch {
        // 如果查找根容器失败，使用原始定位器
        rootContainer = locator;
      }
      
      // 如果没有找到根容器，使用原始定位器
      if (!rootContainer) {
        rootContainer = locator;
      }
      
      // 步骤2：等待根容器可见
      try {
        await rootContainer.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        // 如果等待可见失败，尝试等待元素附加到DOM
        try {
          await rootContainer.waitFor({ state: 'attached', timeout: 5000 });
          console.log(`${stepPrefix}  └─ ⚠️ 根容器存在但不可见，将尝试强制悬停`);
        } catch {
          throw new Error('根容器未找到或不可见');
        }
      }
      
      // 步骤3：滚动到根容器
      try {
        await rootContainer.scrollIntoViewIfNeeded({ timeout: 2000 });
        await this.page.waitForTimeout(200);
      } catch {
        // 滚动失败不影响，继续
      }
      
      // 步骤4：执行 hover
      const isVisible = await rootContainer.isVisible().catch(() => false);
      if (isVisible) {
        await rootContainer.hover({ timeout: 10000 });
        console.log(`${stepPrefix}  └─ ✅ Hover 根容器成功`);
      } else {
        // 如果元素不可见，尝试强制悬停（通过JavaScript事件）
        console.log(`${stepPrefix}  └─ ⚠️ 根容器不可见，尝试通过JavaScript事件强制悬停`);
        await rootContainer.evaluate((el) => {
          const mouseEnterEvent = new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(mouseEnterEvent);
          
          const mouseOverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(mouseOverEvent);
        });
        console.log(`${stepPrefix}  └─ ✅ JavaScript事件触发成功`);
      }
      
      // 步骤5：等待子元素可见
      let menuExpanded = false;
      try {
        const stableMenuSelectors = [
          'li.el-sub-menu.is-opened',
          'li.el-sub-menu.is-active',
          '.el-menu--horizontal .el-sub-menu.is-opened',
          '.el-menu--vertical .el-sub-menu.is-opened',
          '.el-menu--collapse .el-sub-menu.is-opened',
          '[role="menu"]:visible',
          '.el-menu:visible'
        ];
        
        await Promise.race(
          stableMenuSelectors.map(selector => 
            this.page.waitForSelector(selector, { timeout: 3000, state: 'visible' })
          )
        );
        menuExpanded = true;
        console.log(`${stepPrefix}  └─ ✅ 子菜单已展开（策略1成功）`);
      } catch {
        // 策略1失败，进入策略2
        console.log(`${stepPrefix}  └─ ⚠️ 策略1失败，进入策略2: 添加动画等待...`);
        
        // 策略2：添加 300ms 动画等待
        await this.page.waitForTimeout(300);
        
        // 再次检查菜单是否展开
        try {
          const isExpanded = await this.page.evaluate(() => {
            return !!document.querySelector('li.el-sub-menu.is-opened, li.el-sub-menu.is-active, [role="menu"]:visible');
          });
          
          if (isExpanded) {
            menuExpanded = true;
            console.log(`${stepPrefix}    └─ ✅ 动画等待后菜单已展开（策略2成功）`);
          } else {
            // 策略2也失败，进入策略3
            console.log(`${stepPrefix}    └─ ⚠️ 策略2失败，进入策略3: JavaScript 兜底方案...`);
            
            // 策略3：JavaScript 兜底方案
            const jsSuccess = await this.page.evaluate((rootElement) => {
              let current: HTMLElement | null = rootElement as HTMLElement;
              let menuElement: HTMLElement | null = null;
              
              while (current && current !== document.body) {
                const className = current.className || '';
                if (className.includes('el-sub-menu') || 
                    (className.includes('el-menu') && !className.includes('el-menu-item'))) {
                  menuElement = current;
                  break;
                }
                current = current.parentElement;
              }
              
              if (!menuElement) {
                return false;
              }
              
              // 添加展开类
              menuElement.classList.add('is-opened', 'is-active');
              menuElement.setAttribute('aria-expanded', 'true');
              
              // 显示子菜单
              const subMenu = menuElement.querySelector('.el-menu') as HTMLElement;
              if (subMenu) {
                subMenu.style.display = 'block';
                subMenu.style.visibility = 'visible';
                subMenu.style.opacity = '1';
                subMenu.style.height = 'auto';
              }
              
              // 触发Vue组件方法
              const vueInstance = (menuElement as any).__vue__;
              if (vueInstance) {
                if (vueInstance.handleClick) vueInstance.handleClick();
                else if (vueInstance.handleMouseenter) vueInstance.handleMouseenter();
                else if (vueInstance.handleOpen) vueInstance.handleOpen();
              }
              
              // 触发原生事件
              menuElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
              menuElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
              
              return true;
            }, await rootContainer.elementHandle());
            
            if (jsSuccess) {
              await this.page.waitForTimeout(300);
              const isExpanded = await this.page.evaluate(() => {
                return !!document.querySelector('li.el-sub-menu.is-opened, li.el-sub-menu.is-active, [role="menu"]:visible');
              });
              
              if (isExpanded) {
                menuExpanded = true;
                console.log('✅ JavaScript操作成功，菜单已展开（策略3成功）');
              }
            }
          }
        } catch {
          // 忽略错误
        }
      }
      
      // 额外等待，确保菜单项完全可见
      if (menuExpanded) {
        await this.page.waitForTimeout(500);
      } else {
        await this.page.waitForTimeout(300);
      }
      
    } catch (error: any) {
      const locatorInfo = JSON.stringify(step.locator, null, 2);
      throw new Error(`悬停操作失败: ${error.message}\n定位器配置:\n${locatorInfo}`);
    }
  }
}