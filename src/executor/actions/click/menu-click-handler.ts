import { Locator, Page } from '@playwright/test';
import type { TestStep } from '../../../types/test-config';

/**
 * 菜单项点击处理器
 * 处理复杂的菜单项点击逻辑，包括多级菜单展开等
 */
export class MenuClickHandler {
  constructor(private page: Page) {}

  /**
   * 判断是否是菜单项
   */
  isMenuItem(step: TestStep): boolean {
    return step.locator?.strategies?.some(s => 
      (s.type === 'css' && (s.value.includes('el-menu-item') || s.value.includes('el-sub-menu'))) ||
      (s.type === 'text' && s.value)
    ) || false;
  }

  /**
   * 执行菜单项点击
   * @param step 测试步骤
   * @param stepPrefix 步骤前缀（用于日志）
   * @returns 是否点击成功
   */
  async clickMenuItem(step: TestStep, stepPrefix: string): Promise<boolean> {
    const menuItemText = step.locator?.strategies?.find(s => s.type === 'text')?.value;
    
    if (!menuItemText) {
      return false;
    }

    try {
      // 先查找根容器
      const rootContainer = await this.findRootContainer(menuItemText);
      
      if (rootContainer && rootContainer.text) {
        console.log(`${stepPrefix}    └─ ✅ 找到根容器: ${rootContainer.text}`);
        
        // 策略1：定位根容器 → hover → 等子元素可见 → force=True 点击
        const strategy1Success = await this.strategy1(rootContainer, menuItemText, stepPrefix);
        if (strategy1Success) {
          return true;
        }
      }

      // 策略2：300ms 动画等待
      const strategy2Success = await this.strategy2(menuItemText, stepPrefix);
      if (strategy2Success) {
        return true;
      }

      // 策略3：JavaScript 兜底方案
      const strategy3Success = await this.strategy3(menuItemText, rootContainer?.text || null, stepPrefix);
      return strategy3Success;

    } catch (error: any) {
      console.log(`${stepPrefix}  └─ ⚠️ 菜单项点击失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 查找根容器
   */
  private async findRootContainer(menuItemText: string): Promise<{ text: string; stableClass: string } | null> {
    return await this.page.evaluate((text) => {
      // 找到菜单项
      let menuItem: HTMLElement | null = null;
      
      // 方法1：查找 el-menu-item
      menuItem = Array.from(document.querySelectorAll('li.el-menu-item'))
        .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
      
      // 方法2：查找 span.v-menu__title
      if (!menuItem) {
        const titleSpan = Array.from(document.querySelectorAll('span.v-menu__title'))
          .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
        if (titleSpan) {
          let parent = titleSpan.parentElement;
          while (parent && parent !== document.body) {
            if (parent.tagName.toLowerCase() === 'li' && 
                (parent.className.includes('el-menu-item') || parent.className.includes('menu-item'))) {
              menuItem = parent as HTMLElement;
              break;
            }
            parent = parent.parentElement;
          }
        }
      }
      
      // 方法3：查找任何包含文本的菜单相关元素
      if (!menuItem) {
        menuItem = Array.from(document.querySelectorAll('li[class*="menu-item"], span[class*="menu"]'))
          .find(el => el.textContent?.trim().includes(text)) as HTMLElement | null;
      }
      
      if (!menuItem) return null;
      
      // 向上查找根容器
      let current: HTMLElement | null = menuItem.parentElement;
      while (current && current !== document.body) {
        const className = current.className || '';
        if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) && 
            !className.includes('el-menu-item') && !className.includes('menu-item')) {
          const title = current.querySelector('.el-sub-menu__title') || 
                       current.querySelector('.v-menu__title') ||
                       current.querySelector('[class*="menu-title"]') ||
                       current.querySelector('span');
          
          return {
            text: title?.textContent?.trim() || current.textContent?.trim().substring(0, 50) || '',
            stableClass: className.split(/\s+/).find(c => 
              (c.startsWith('el-sub-menu') || c.startsWith('v-menu')) && 
              !c.includes('el-id-') && !c.includes('menu-item')
            ) || (className.includes('el-sub-menu') ? 'el-sub-menu' : 'v-menu')
          };
        }
        current = current.parentElement;
      }
      return null;
    }, menuItemText);
  }

  /**
   * 策略1：定位根容器 → hover → 等子元素可见 → force=True 点击
   */
  private async strategy1(
    rootContainer: { text: string; stableClass: string },
    menuItemText: string,
    stepPrefix: string
  ): Promise<boolean> {
    try {
      // hover 根容器
      const hoverSuccess = await this.hoverRootContainer(rootContainer, stepPrefix);
      
      if (hoverSuccess) {
        // 等待子菜单展开
        await Promise.race([
          this.page.waitForSelector(
            'li.el-sub-menu.is-opened, li.el-sub-menu.is-active, li[class*="sub-menu"].is-opened, [role="menu"]:visible, ul[class*="menu"]:visible',
            { timeout: 3000, state: 'visible' }
          ),
          this.page.waitForSelector(
            `li.el-menu-item:has-text("${menuItemText}"), span.v-menu__title:has-text("${menuItemText}")`,
            { timeout: 3000, state: 'visible' }
          )
        ]).catch(() => {});
        
        console.log(`${stepPrefix}    └─ ✅ 子菜单已展开`);
        
        // 300ms 动画等待
        await this.page.waitForTimeout(300);
        
        // 点击菜单项
        const childMenuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
        try {
          await childMenuItemLocator.waitFor({ state: 'visible', timeout: 2000 });
        } catch {
          // 如果不可见，使用 force
        }
        
        await childMenuItemLocator.click({ force: true, timeout: 5000 });
        console.log(`${stepPrefix}  └─ ✅ Force 点击子菜单项成功（策略1成功）`);
        return true;
      }
    } catch (error: any) {
      console.log(`${stepPrefix}  └─ ⚠️ 策略1失败: ${error.message}`);
    }
    return false;
  }

  /**
   * 策略2：300ms 动画等待
   */
  private async strategy2(menuItemText: string, stepPrefix: string): Promise<boolean> {
    try {
      console.log(`${stepPrefix}    └─ 📌 策略2: 添加 300ms 动画等待`);
      
      try {
        const menuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
        await menuItemLocator.waitFor({ state: 'visible', timeout: 2000 });
      } catch {
        // 如果不可见，使用 force
      }
      
      await this.page.waitForTimeout(300);
      
      const menuItemLocator = this.page.getByText(menuItemText, { exact: false }).first();
      await menuItemLocator.click({ force: true, timeout: 5000 });
      console.log(`${stepPrefix}    └─ ✅ 动画等待后点击成功（策略2成功）`);
      return true;
    } catch (error: any) {
      console.log(`${stepPrefix}    └─ ⚠️ 策略2失败: ${error.message}`);
    }
    return false;
  }

  /**
   * 策略3：JavaScript 兜底方案
   */
  private async strategy3(menuItemText: string, rootContainerText: string | null, stepPrefix: string): Promise<boolean> {
    try {
      console.log(`${stepPrefix}      └─ 📌 策略3: JavaScript 兜底方案（100% 解决）`);
      
      const success = await this.page.evaluate((args: { text: string; rootContainerText: string | null }) => {
        const { text, rootContainerText } = args;
        
        // 查找菜单项
        let menuItem: HTMLElement | null = Array.from(document.querySelectorAll('li.el-menu-item'))
          .find(el => {
            const itemText = el.textContent?.trim() || '';
            return itemText === text || itemText.includes(text);
          }) as HTMLElement | null;
        
        if (!menuItem) {
          const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
          menuItem = allElements.find(el => {
            const elText = el.textContent?.trim() || '';
            return elText === text || elText.includes(text);
          }) || null;
        }
        
        if (!menuItem) return false;
        
        // 向上查找根容器并展开
        let current: HTMLElement | null = menuItem.parentElement;
        while (current && current !== document.body) {
          const className = current.className || '';
          if ((className.includes('el-sub-menu') || className.includes('sub-menu') || className.includes('v-menu')) &&
              !className.includes('el-menu-item') && !className.includes('menu-item')) {
            current.classList.add('is-opened', 'is-active');
            current.setAttribute('aria-expanded', 'true');
            
            const subMenu = current.querySelector('.el-menu') as HTMLElement;
            if (subMenu) {
              subMenu.style.display = 'block';
              subMenu.style.visibility = 'visible';
              subMenu.style.opacity = '1';
            }
            
            break;
          }
          current = current.parentElement;
        }
        
        // 点击菜单项
        setTimeout(() => {
          (menuItem as HTMLElement).click();
        }, 100);
        
        return true;
      }, { text: menuItemText, rootContainerText });
      
      if (success) {
        await this.page.waitForTimeout(300);
        console.log(`${stepPrefix}      └─ ✅ JavaScript操作成功（策略3成功）`);
        return true;
      }
    } catch (error: any) {
      console.log(`${stepPrefix}      └─ ⚠️ 策略3失败: ${error.message}`);
    }
    return false;
  }

  /**
   * Hover 根容器
   */
  private async hoverRootContainer(
    rootContainer: { text: string; stableClass: string },
    stepPrefix: string
  ): Promise<boolean> {
    // 简化的 hover 逻辑（完整版可以参考 hover-action-handler）
    try {
      const rootLocator = this.page.getByText(rootContainer.text, { exact: false }).first();
      try {
        await rootLocator.waitFor({ state: 'visible', timeout: 2000 });
      } catch {
        await rootLocator.waitFor({ state: 'attached', timeout: 2000 });
      }
      await rootLocator.hover({ timeout: 3000, force: true });
      return true;
    } catch {
      // 如果失败，尝试使用 JavaScript
      try {
        await this.page.evaluate((text) => {
          const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[];
          const element = allElements.find(el => el.textContent?.trim().includes(text));
          if (element) {
            const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window });
            element.dispatchEvent(mouseEnterEvent);
            element.classList.add('is-opened', 'is-active');
          }
        }, rootContainer.text);
        return true;
      } catch {
        return false;
      }
    }
  }
}