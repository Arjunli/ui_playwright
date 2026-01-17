# 悬停录制器改进文档

## 改进概述

本次改进优化了录制器的悬停捕获逻辑，实现了以下三个核心功能：

### ✅ 1. 优先识别菜单结构

**实现位置：** `src/recorder/menu-detector.ts`

**核心功能：**
- 自动检测元素是否是菜单相关元素（`el-menu`, `el-sub-menu`, `el-menu-item`）
- 区分父菜单（`el-sub-menu`）和子菜单项（`el-menu-item`）
- 识别菜单文本和结构

**检测逻辑：**
```typescript
// 检测菜单元素
const isMenuElement = tagName.includes('menu') || 
                     className.includes('menu') ||
                     className.includes('sub-menu');

// 检测父菜单
const isParentMenu = className.includes('el-sub-menu') && 
                    className.includes('el-sub-menu__title');

// 检测子菜单项
const isChildMenuItem = className.includes('el-menu-item');
```

### ✅ 2. 自动检测父菜单，生成精准定位

**实现位置：** `src/recorder/menu-detector.ts` + `src/recorder/action-capture.ts`

**核心功能：**
- 当检测到子菜单项点击时，自动查找父菜单
- 生成父菜单的精准定位策略（text + css + xpath 组合）
- 自动添加父菜单悬停步骤

**生成策略优先级：**
1. **组合CSS选择器** (priority: 5.5)
   ```css
   li.el-sub-menu:has-text("系统") > div.el-sub-menu__title
   ```

2. **text定位** (priority: 6)
   ```typescript
   { type: 'text', value: '系统' }
   ```

3. **CSS + text** (priority: 6.5)
   ```css
   div.el-sub-menu__title:has-text("系统")
   ```

4. **XPath** (priority: 6.8)
   ```xpath
   //div[@class="el-sub-menu__title"]//span[text()="系统"]
   ```

**自动添加逻辑：**
```typescript
// 当点击子菜单项时，自动检测并添加父菜单悬停
if (menuStructure.isChildMenuItem && menuStructure.parentMenu) {
  // 检查是否已有父菜单悬停（避免重复）
  const recentHover = this.capturedActions
    .slice(-5)
    .find(action => 
      action.type === 'hover' && 
      action.data?.isParentMenuHover &&
      action.data?.menuStructure?.text === menuStructure.parentMenu?.text
    );
  
  if (!recentHover) {
    // 生成父菜单定位策略并添加悬停步骤
    const parentMenuStrategies = MenuDetector.generateParentMenuLocator(menuStructure.parentMenu);
    // ... 添加悬停步骤
  }
}
```

### ✅ 3. 添加悬停有效性验证

**实现位置：** `src/recorder/menu-detector.ts`

**核心功能：**
- 验证悬停后子菜单是否展开
- 检查菜单展开标记（`is-opened`, `is-active`）
- 验证子菜单项是否可见

**验证方法：**
```typescript
static async validateHoverEffect(
  page: any,
  parentMenuText?: string,
  expectedChildMenuText?: string
): Promise<{ valid: boolean; reason?: string }>
```

**验证步骤：**
1. 检查菜单展开标记（`li.el-sub-menu.is-opened`）
2. 如果指定了子菜单文本，检查子菜单是否可见
3. 检查父菜单下是否有子菜单项出现

**使用场景：**
- 录制时：可选验证（不阻塞录制流程）
- 回放时：自动验证（确保悬停成功）

## 智能优化功能

### ✅ 智能检测悬停目标

**功能：** `MenuDetector.findBestHoverTarget()`

**逻辑：**
- 如果悬停的是子菜单项，自动向上查找父菜单元素
- 如果悬停的是父菜单，直接使用
- 如果悬停的是非菜单元素，但父元素是菜单，使用父元素

**示例：**
```typescript
// 用户悬停在子菜单项上
// 自动检测到父菜单，生成父菜单悬停步骤
const bestTarget = MenuDetector.findBestHoverTarget(elementData);
// 返回父菜单元素，而不是子菜单项
```

### ✅ 过滤无效悬停

**功能：** 自动过滤空白区域、通用div等无效悬停

**过滤规则：**
- 过滤通用选择器：`div.el-col`, `div.el-row`, `td.el-table_1_column_5`
- 过滤低优先级策略（priority >= 7）且选择器很通用的定位
- 只保留有效的悬停操作

## 使用示例

### 录制场景1：悬停父菜单

**用户操作：** 鼠标悬停在"系统"菜单上

**录制结果：**
```json
{
  "action": "hover",
  "locator": {
    "strategies": [
      {
        "type": "css",
        "value": "li.el-sub-menu:has-text(\"系统\") > div.el-sub-menu__title",
        "priority": 5.5
      },
      {
        "type": "text",
        "value": "系统",
        "priority": 6
      }
    ],
    "description": "定位系统父菜单并悬停"
  },
  "description": "鼠标悬停系统菜单，展开子选项"
}
```

### 录制场景2：点击子菜单项（自动添加父菜单悬停）

**用户操作：** 直接点击"角色管理"子菜单项

**录制结果（自动优化）：**
```json
// 步骤1：自动添加的父菜单悬停
{
  "action": "hover",
  "locator": {
    "strategies": [
      {
        "type": "css",
        "value": "li.el-sub-menu:has-text(\"系统\") > div.el-sub-menu__title",
        "priority": 5.5
      },
      {
        "type": "text",
        "value": "系统",
        "priority": 6
      }
    ],
    "description": "定位系统父菜单并悬停"
  },
  "description": "鼠标悬停系统菜单，展开子选项"
},
// 步骤2：点击子菜单项
{
  "action": "click",
  "locator": {
    "strategies": [
      {
        "type": "css",
        "value": "li.el-menu-item:has-text(\"角色管理\") > span.v-menu__title:has-text(\"角色管理\")",
        "priority": 5.5
      },
      {
        "type": "text",
        "value": "角色管理",
        "priority": 6
      }
    ],
    "description": "定位 span 元素"
  },
  "description": "点击元素"
}
```

## 改进效果

### ✅ 改进前的问题
1. ❌ 悬停定位不准确（定位到空白区域 `div.el-col`）
2. ❌ 缺少父菜单悬停步骤
3. ❌ 悬停无效，导致子菜单未展开

### ✅ 改进后的效果
1. ✅ 自动识别菜单结构，精准定位父菜单
2. ✅ 点击子菜单项时自动添加父菜单悬停步骤
3. ✅ 过滤无效悬停，只保留有效操作
4. ✅ 生成精准的定位策略（text + css + xpath 组合）

## 技术细节

### 菜单结构检测算法

```typescript
// 1. 检测元素类型
const isMenuElement = tagName.includes('menu') || className.includes('menu');

// 2. 查找父菜单信息
let current = elementData.parent;
while (current && depth < 5) {
  if (className.includes('el-sub-menu')) {
    parentMenu = { tagName, className, text, id };
    break;
  }
  current = current.parent;
}

// 3. 生成定位策略
const strategies = [
  { type: 'css', value: `li.el-sub-menu:has-text("${text}") > div.el-sub-menu__title`, priority: 5.5 },
  { type: 'text', value: text, priority: 6 },
  // ...
];
```

### 自动添加父菜单悬停的时机

1. **点击子菜单项时**：自动检测并添加父菜单悬停
2. **悬停子菜单项时**：自动切换到父菜单悬停
3. **避免重复**：检查最近2秒内是否已有父菜单悬停

## 后续优化方向

1. **支持多级菜单**：检测三级、四级菜单结构
2. **支持其他UI框架**：Ant Design、Material-UI 等
3. **智能等待**：悬停后自动等待子菜单展开
4. **录制时验证**：可选地在录制时验证悬停有效性
