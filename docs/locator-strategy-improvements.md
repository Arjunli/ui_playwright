# 定位策略改进方案（参考八爪鱼）

## 八爪鱼的核心定位策略

### 1. **元素指纹识别（Element Fingerprint）**
- 结合多个属性生成唯一标识：`tagName + id + className + text + position`
- 评估每个属性的稳定性，优先使用稳定属性
- 生成"元素签名"，即使部分属性变化也能识别

### 2. **相对路径定位（Relative XPath）**
- 使用相对XPath而不是绝对路径
- 基于父元素、兄弟元素定位
- 例如：`//div[@class='parent']//button[text()='确定']`

### 3. **多策略Fallback机制**
- 生成多个定位策略，按稳定性排序
- 执行时依次尝试，直到成功
- 优先级：`testid > id > name > placeholder > role > text > css > xpath`

### 4. **元素稳定性评分**
- 评估每个定位策略的稳定性
- 动态ID、随机类名等不稳定属性降权
- 稳定属性（如固定的class、name）优先

### 5. **智能重试和容错**
- 定位失败时自动尝试下一个策略
- 支持模糊匹配（部分文本匹配）
- 支持位置定位（第N个元素）

## 当前框架的改进方向

### 已实现的功能 ✅
1. ✅ 多策略定位（testid, id, name, placeholder, role, text, css, xpath）
2. ✅ 优先级排序和Fallback机制
3. ✅ 动态ID检测和过滤
4. ✅ 带文本的CSS选择器（`:has-text()`）
5. ✅ 父菜单路径定位（组合选择器）

### 需要改进的功能 🔧

#### 1. **元素指纹识别**
- 为每个元素生成唯一指纹
- 结合多个属性计算稳定性分数
- 优先使用高稳定性属性

#### 2. **相对XPath生成**
- 生成相对XPath（基于父元素）
- 避免使用绝对路径（如 `/html/body/div[1]/div[2]`）
- 使用属性过滤而不是位置索引

#### 3. **兄弟节点定位**
- 通过兄弟元素来定位目标元素
- 例如：`//button[preceding-sibling::span[text()='标签']]`

#### 4. **元素稳定性评分系统**
- 为每个定位策略计算稳定性分数
- 动态调整优先级
- 记录历史成功率

#### 5. **智能文本匹配**
- 支持部分文本匹配
- 支持正则表达式匹配
- 支持忽略大小写

## 实现计划

### Phase 1: 元素指纹识别（高优先级）✅
- [x] 实现元素指纹生成算法 (`calculateElementFingerprint`)
- [x] 计算属性稳定性分数（testid +10, id +8, name +7, placeholder +6, role +5, className +4, text +3, tagName +1）
- [x] 优化定位策略优先级

### Phase 2: 相对XPath生成（中优先级）✅
- [x] 实现相对XPath生成器 (`generateXPath`)
- [x] 基于父元素生成路径
- [x] 避免使用位置索引

### Phase 3: 稳定性评分系统（中优先级）✅
- [x] 实现稳定性评分算法 (`locator-stats.ts`)
- [x] 记录定位成功率 (`recordSuccess` / `recordFailure`)
- [x] 动态调整策略优先级 (`adjustPriority`)

### Phase 4: 智能匹配（低优先级）✅
- [x] 实现部分文本匹配 (`getByText` with `exact: false`)
- [x] 支持正则表达式 (`getByRole` with `RegExp`)
- [x] 支持模糊匹配（已集成到 Playwright 的 locator 中）

### Phase 5: 兄弟节点定位（新增）✅
- [x] 收集兄弟元素信息（在 `getElementData` 中）
- [x] 生成基于兄弟节点的XPath (`following-sibling::`)
- [x] 优先使用前一个兄弟元素（更稳定）

## 已实现的完整功能列表

### ✅ 核心功能
1. **元素指纹识别** - `calculateElementFingerprint` 方法
2. **相对XPath生成** - `generateXPath` 方法（支持父元素和兄弟元素）
3. **历史成功率记录** - `locator-stats.ts` 模块
4. **动态优先级调整** - 基于历史成功率自动调整
5. **兄弟节点定位** - 通过 `following-sibling::` 定位
6. **智能文本匹配** - 支持精确匹配和部分匹配
7. **正则表达式匹配** - 支持 `RegExp` 用于 role 定位

### 📊 统计功能
- 记录每个定位策略的成功/失败次数
- 计算成功率并动态调整优先级
- 自动清理旧统计（保留最近1000条）
- 提供统计查询接口（`getAllStats`）

### 🎯 定位策略优先级（动态调整后）
1. testid (1) - 最稳定
2. placeholder (2) - 输入框专用
3. name (3) - 表单元素
4. role (4) - 可访问性属性
5. id (5) - 静态ID
6. 组合CSS (5.5) - 父菜单+子菜单
7. text (6) - 文本内容
8. 带文本CSS (6.5) - CSS + :has-text()
9. 兄弟节点XPath (7.5) - 基于兄弟元素
10. 普通CSS (7) - 基础CSS选择器
11. 相对XPath (8) - 基于父元素
12. 绝对XPath (8) - 最后备选
