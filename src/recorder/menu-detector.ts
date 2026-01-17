/**
 * 菜单结构检测器
 * 用于识别菜单结构，自动检测父菜单，生成精准定位
 */
export interface MenuStructure {
  isMenuElement: boolean;
  isParentMenu: boolean;
  isChildMenuItem: boolean;
  parentMenu?: {
    tagName: string;
    className: string;
    text: string;
    id?: string;
  };
  menuText?: string;
}

export class MenuDetector {
  /**
   * 检测元素是否是菜单相关元素
   */
  static detectMenuStructure(elementData: any): MenuStructure {
    const tagName = elementData.tagName?.toLowerCase() || '';
    const className = elementData.className || '';
    const text = (elementData.text || '').trim();
    
    // 检测是否是菜单元素
    const isMenuElement = tagName.includes('menu') || 
                         className.includes('menu') ||
                         className.includes('sub-menu') ||
                         className.includes('el-menu') ||
                         className.includes('el-sub-menu');
    
    // 检测是否是父菜单（el-sub-menu）
    const isParentMenu = className.includes('el-sub-menu') && 
                        (className.includes('el-sub-menu__title') || tagName === 'li');
    
    // 检测是否是子菜单项（el-menu-item）
    const isChildMenuItem = className.includes('el-menu-item') ||
                           (tagName === 'li' && className.includes('menu-item'));
    
    // 查找父菜单信息
    let parentMenu: MenuStructure['parentMenu'] | undefined;
    
    if (elementData.parentMenuInfo && elementData.parentMenuInfo.length > 0) {
      // 使用最近的父菜单
      const parentMenuData = elementData.parentMenuInfo[0];
      parentMenu = {
        tagName: parentMenuData.tagName || 'li',
        className: parentMenuData.className || '',
        text: parentMenuData.text || '',
        id: parentMenuData.id,
      };
    } else if (elementData.parent) {
      // 从父元素中查找菜单信息
      let current = elementData.parent;
      let depth = 0;
      while (current && depth < 5) {
        const parentTagName = current.tagName?.toLowerCase() || '';
        const parentClassName = current.className || '';
        const parentText = (current.text || '').trim();
        
        if (parentClassName.includes('el-sub-menu') || 
            parentClassName.includes('sub-menu')) {
          parentMenu = {
            tagName: parentTagName,
            className: parentClassName.split(/\s+/)[0] || '',
            text: parentText.length < 30 ? parentText : '',
            id: current.id,
          };
          break;
        }
        current = current.parent;
        depth++;
      }
    }
    
    return {
      isMenuElement,
      isParentMenu,
      isChildMenuItem,
      parentMenu,
      menuText: text.length < 50 ? text : undefined,
    };
  }

  /**
   * 生成父菜单的精准定位策略
   */
  static generateParentMenuLocator(parentMenu: MenuStructure['parentMenu']): any[] {
    if (!parentMenu) {
      return [];
    }
    
    const strategies: any[] = [];
    const escapeText = (text: string) => text.replace(/"/g, '\\"').replace(/'/g, "\\'");
    
    // 1. 组合 CSS 选择器（最高优先级）
    if (parentMenu.className && parentMenu.text) {
      const escapedText = escapeText(parentMenu.text);
      strategies.push({
        type: 'css',
        value: `li.el-sub-menu:has-text("${escapedText}") > div.el-sub-menu__title`,
        priority: 5.5,
      });
    }
    
    // 2. text 定位
    if (parentMenu.text) {
      strategies.push({
        type: 'text',
        value: parentMenu.text,
        priority: 6,
      });
    }
    
    // 3. CSS + text
    if (parentMenu.className && parentMenu.text) {
      const escapedText = escapeText(parentMenu.text);
      strategies.push({
        type: 'css',
        value: `div.el-sub-menu__title:has-text("${escapedText}")`,
        priority: 6.5,
      });
    }
    
    // 4. XPath
    if (parentMenu.text) {
      const escapedText = escapeText(parentMenu.text);
      strategies.push({
        type: 'xpath',
        value: `//div[@class="el-sub-menu__title"]//span[text()="${escapedText}"]`,
        priority: 6.8,
      });
    }
    
    return strategies;
  }

  /**
   * 验证悬停有效性
   * 检查悬停后子菜单是否展开
   * @param page Playwright Page 对象
   * @param parentMenuText 父菜单文本（用于验证）
   * @param expectedChildMenuText 期望的子菜单文本（可选）
   * @returns 是否验证通过
   */
  static async validateHoverEffect(
    page: any,
    parentMenuText?: string,
    expectedChildMenuText?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // 方法1：检查菜单展开标记（ElementUI 菜单展开后会添加 is-opened 或 is-active 类）
      const menuExpanded = await page.waitForSelector(
        'li.el-sub-menu.is-opened, li.el-sub-menu.is-active, ' +
        '.el-menu--horizontal .el-sub-menu.is-opened, ' +
        '.el-menu--vertical .el-sub-menu.is-opened',
        { timeout: 2000, state: 'visible' }
      ).catch(() => null);
      
      if (menuExpanded) {
        // 如果指定了子菜单文本，检查子菜单是否可见
        if (expectedChildMenuText) {
          const childMenu = page.locator(`text=${expectedChildMenuText}`).first();
          const isVisible = await childMenu.isVisible().catch(() => false);
          if (isVisible) {
            return { valid: true };
          } else {
            return { valid: false, reason: `子菜单"${expectedChildMenuText}"不可见` };
          }
        }
        return { valid: true };
      }
      
      // 方法2：如果方法1失败，检查是否有子菜单项出现
      if (expectedChildMenuText) {
        const childMenu = page.locator(`text=${expectedChildMenuText}`).first();
        const isVisible = await childMenu.isVisible().catch(() => false);
        if (isVisible) {
          return { valid: true };
        }
      }
      
      // 方法3：检查父菜单下是否有子菜单项（el-menu-item）
      if (parentMenuText) {
        const parentMenu = page.locator(`text=${parentMenuText}`).first();
        const childItems = parentMenu.locator('..').locator('li.el-menu-item');
        const count = await childItems.count().catch(() => 0);
        if (count > 0) {
          return { valid: true };
        }
      }
      
      return { valid: false, reason: '未检测到菜单展开标记或子菜单项' };
    } catch (error: any) {
      return { valid: false, reason: `验证失败: ${error.message}` };
    }
  }

  /**
   * 智能检测悬停目标
   * 如果悬停的是子元素，自动向上查找父菜单元素
   */
  static findBestHoverTarget(elementData: any): any {
    if (!elementData) {
      return null;
    }
    
    const menuStructure = this.detectMenuStructure(elementData);
    
    // 如果当前元素是子菜单项，返回父菜单信息
    if (menuStructure.isChildMenuItem && menuStructure.parentMenu) {
      return {
        ...elementData,
        isParentMenu: true,
        tagName: menuStructure.parentMenu.tagName,
        className: menuStructure.parentMenu.className,
        text: menuStructure.parentMenu.text,
        id: menuStructure.parentMenu.id,
      };
    }
    
    // 如果当前元素是父菜单，直接返回
    if (menuStructure.isParentMenu) {
      return elementData;
    }
    
    // 如果当前元素不是菜单元素，但父元素是菜单，返回父元素
    if (!menuStructure.isMenuElement && elementData.parent) {
      const parentStructure = this.detectMenuStructure(elementData.parent);
      if (parentStructure.isParentMenu) {
        return elementData.parent;
      }
    }
    
    // 默认返回当前元素
    return elementData;
  }
}
