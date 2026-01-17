# 菜单展开替代方案

除了悬停（hover）之外，还有多种方法可以展开菜单：

## 1. 点击展开（Click to Expand）

### 适用场景
- ElementUI 垂直菜单（`el-menu--vertical`）
- 折叠菜单（`el-menu--collapse`）
- 某些菜单支持点击展开

### 实现方式
```typescript
// 点击菜单标题展开
const menuTitle = page.locator('li.el-sub-menu:has-text("系统") > div.el-sub-menu__title');
await menuTitle.click();

// 或者通过 JavaScript 直接点击
await page.evaluate(() => {
  const menu = document.querySelector('li.el-sub-menu:has-text("系统")');
  const title = menu?.querySelector('.el-sub-menu__title');
  (title as HTMLElement)?.click();
});
```

### 优势
- ✅ 更稳定，不依赖鼠标位置
- ✅ 适用于垂直菜单和折叠菜单
- ✅ 可以明确控制展开状态

### 劣势
- ❌ 某些水平菜单可能不支持点击展开
- ❌ 需要额外的点击操作

## 2. JavaScript 直接操作（Direct DOM Manipulation）

### 适用场景
- 悬停失败时
- 需要强制展开菜单
- 菜单状态需要精确控制

### 实现方式
```typescript
// 方法1：直接设置菜单状态
await page.evaluate(() => {
  const menu = document.querySelector('li.el-sub-menu:has-text("系统")');
  if (menu) {
    menu.classList.add('is-opened');
    menu.setAttribute('aria-expanded', 'true');
  }
});

// 方法2：触发菜单组件的方法（如果可用）
await page.evaluate(() => {
  const menu = document.querySelector('li.el-sub-menu:has-text("系统")');
  const vueInstance = (menu as any).__vue__;
  if (vueInstance && vueInstance.handleClick) {
    vueInstance.handleClick();
  }
});

// 方法3：显示子菜单（直接操作DOM）
await page.evaluate(() => {
  const menu = document.querySelector('li.el-sub-menu:has-text("系统")');
  const subMenu = menu?.querySelector('.el-menu');
  if (subMenu) {
    (subMenu as HTMLElement).style.display = 'block';
    (subMenu as HTMLElement).style.visibility = 'visible';
  }
});
```

### 优势
- ✅ 最可靠，不依赖用户交互
- ✅ 可以精确控制菜单状态
- ✅ 适用于所有场景

### 劣势
- ❌ 可能绕过某些业务逻辑
- ❌ 需要了解菜单的DOM结构

## 3. 键盘操作（Keyboard Navigation）

### 适用场景
- 菜单支持键盘导航
- 无障碍访问场景
- 悬停和点击都失败时

### 实现方式
```typescript
// 方法1：Tab键导航到菜单，然后按Enter或Space展开
const menuTitle = page.locator('li.el-sub-menu:has-text("系统") > div.el-sub-menu__title');
await menuTitle.focus();
await page.keyboard.press('Enter'); // 或 'Space'

// 方法2：方向键导航
await page.keyboard.press('ArrowDown'); // 向下导航到菜单
await page.keyboard.press('ArrowRight'); // 展开子菜单

// 方法3：快捷键（如果菜单支持）
await page.keyboard.press('Alt+S'); // 假设Alt+S是"系统"菜单的快捷键
```

### 优势
- ✅ 符合无障碍访问标准
- ✅ 不依赖鼠标位置
- ✅ 可以精确控制

### 劣势
- ❌ 需要菜单支持键盘导航
- ❌ 可能与其他快捷键冲突

## 4. 直接定位子菜单（Direct Child Menu Locator）

### 适用场景
- 子菜单在DOM中但被隐藏
- 只需要点击子菜单项，不需要展开动画

### 实现方式
```typescript
// 方法1：直接定位子菜单项（即使被隐藏）
const childMenuItem = page.locator('li.el-menu-item:has-text("角色管理")');
await childMenuItem.click({ force: true });

// 方法2：先显示子菜单，再点击
await page.evaluate(() => {
  const menu = document.querySelector('li.el-sub-menu:has-text("系统")');
  const subMenu = menu?.querySelector('.el-menu');
  if (subMenu) {
    (subMenu as HTMLElement).style.display = 'block';
  }
});
const childMenuItem = page.locator('li.el-menu-item:has-text("角色管理")');
await childMenuItem.click();
```

### 优势
- ✅ 最快，跳过展开步骤
- ✅ 适用于只需要点击子菜单的场景

### 劣势
- ❌ 可能跳过重要的展开逻辑
- ❌ 子菜单可能不在DOM中

## 5. 组合策略（Fallback Chain）

### 推荐实现
按优先级尝试多种方法：

```typescript
async function expandMenu(parentMenuText: string): Promise<boolean> {
  // 策略1：尝试悬停（最快，最自然）
  try {
    const menuTitle = page.locator(`li.el-sub-menu:has-text("${parentMenuText}") > div.el-sub-menu__title`);
    await menuTitle.hover();
    await page.waitForSelector('li.el-sub-menu.is-opened', { timeout: 2000 });
    return true;
  } catch {
    // 悬停失败，继续尝试其他方法
  }
  
  // 策略2：尝试点击展开
  try {
    const menuTitle = page.locator(`li.el-sub-menu:has-text("${parentMenuText}") > div.el-sub-menu__title`);
    await menuTitle.click();
    await page.waitForSelector('li.el-sub-menu.is-opened', { timeout: 2000 });
    return true;
  } catch {
    // 点击失败，继续尝试其他方法
  }
  
  // 策略3：JavaScript直接操作（最可靠）
  try {
    await page.evaluate((text) => {
      const menu = Array.from(document.querySelectorAll('li.el-sub-menu'))
        .find(el => el.textContent?.includes(text));
      if (menu) {
        menu.classList.add('is-opened');
        menu.setAttribute('aria-expanded', 'true');
        const subMenu = menu.querySelector('.el-menu') as HTMLElement;
        if (subMenu) {
          subMenu.style.display = 'block';
        }
      }
    }, parentMenuText);
    await page.waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}
```

## 当前代码中的实现

### ✅ 已实现的功能

1. **点击展开**（`locator-resolver.ts`）
   - 在定位元素时，如果元素在折叠的父菜单中，会自动尝试点击展开
   - 代码位置：`src/executor/locator-resolver.ts:356-376`

2. **JavaScript事件触发**（`step-runner.ts`）
   - 悬停失败时，会尝试通过JavaScript事件强制悬停
   - 代码位置：`src/executor/step-runner.ts:1039-1054`

### 🔄 可以改进的地方

1. **添加点击展开作为悬停的备选方案**
2. **添加JavaScript直接操作作为最后备选**
3. **支持键盘导航**
4. **实现组合策略（Fallback Chain）**

## 建议的改进方案

### 方案1：在悬停操作中添加备选策略

修改 `runHover` 方法，如果悬停失败，自动尝试点击展开：

```typescript
// 如果悬停失败，尝试点击展开
if (!menuExpanded) {
  try {
    await locator.click();
    await page.waitForSelector('li.el-sub-menu.is-opened', { timeout: 2000 });
  } catch {
    // 如果点击也失败，尝试JavaScript操作
    await page.evaluate((el) => {
      const menu = el.closest('li.el-sub-menu');
      if (menu) {
        menu.classList.add('is-opened');
      }
    }, await locator.elementHandle());
  }
}
```

### 方案2：添加新的操作类型

在JSON配置中添加新的操作类型：

```json
{
  "action": "expand-menu",
  "locator": {
    "strategies": [
      { "type": "text", "value": "系统", "priority": 6 }
    ]
  },
  "method": "click", // 或 "hover", "javascript", "keyboard"
  "description": "展开系统菜单"
}
```

### 方案3：智能检测菜单类型

根据菜单类型自动选择最佳方法：

```typescript
// 检测菜单类型
const isVerticalMenu = await page.locator('.el-menu--vertical').isVisible();
const isCollapseMenu = await page.locator('.el-menu--collapse').isVisible();

if (isCollapseMenu || isVerticalMenu) {
  // 垂直菜单或折叠菜单，使用点击
  await menuTitle.click();
} else {
  // 水平菜单，使用悬停
  await menuTitle.hover();
}
```

## 总结

| 方法 | 稳定性 | 速度 | 适用场景 | 推荐度 |
|------|--------|------|----------|--------|
| 悬停（Hover） | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 水平菜单 | ⭐⭐⭐⭐⭐ |
| 点击展开（Click） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 垂直菜单、折叠菜单 | ⭐⭐⭐⭐ |
| JavaScript操作 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 所有场景（备选） | ⭐⭐⭐⭐ |
| 键盘导航 | ⭐⭐⭐ | ⭐⭐⭐ | 无障碍访问 | ⭐⭐⭐ |
| 直接定位子菜单 | ⭐⭐ | ⭐⭐⭐⭐⭐ | 子菜单在DOM中 | ⭐⭐ |

**推荐策略：悬停 → 点击 → JavaScript操作（Fallback Chain）**
