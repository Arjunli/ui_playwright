# 定位策略执行顺序（优先级）

## 当前执行顺序

执行器会按照优先级从高到低（priority 数字从小到大）依次尝试定位策略，直到成功为止。

### 优先级列表（从高到低）

| 优先级 | 策略类型 | 说明 | 示例 |
|--------|---------|------|------|
| **1** | `testid` | data-testid 属性（最稳定） | `data-testid="submit-button"` |
| **2** | `placeholder` | placeholder 属性（输入框） | `placeholder="请输入用户名"` |
| **3** | `name` | name 属性（表单元素） | `name="username"` |
| **3.5** | **`xpath`（完整路径）** | **完整 XPath 路径（新增）** | `/html/body/div[@id='app']/button[@id='submit']` |
| **4** | `role` | role 属性（可访问性） | `role="button"` |
| **5.5** | `css`（组合选择器） | 组合 CSS 选择器（菜单等） | `li.el-sub-menu:has-text("菜单") > span` |
| **5.8** | `xpath`（相对路径） | 相对 XPath 路径 | `//button[@id='submit']` |
| **6** | `text` | 文本内容 | `text="提交"` |
| **6.5** | `xpath`（兄弟节点） | 基于兄弟节点的 XPath | `//兄弟元素/following-sibling::目标元素` |
| **6.8** | `xpath`（父元素） | 基于父元素的 XPath | `//父元素//子元素` |
| **7** | `css` | CSS 选择器 | `button.el-button` |
| **99** | `css`（兜底） | 兜底 CSS 选择器 | `button` |

## 执行流程

```typescript
// LocatorEngine.resolve() 方法
async resolve(locatorConfig: LocatorConfig): Promise<Locator> {
  let strategies = locatorConfig.strategies || [];
  
  // 1. 根据历史成功率动态调整优先级
  strategies = this.stabilityService.adjustPriorities(strategies);
  
  // 2. 按调整后的优先级排序（数字越小优先级越高）
  strategies = strategies.sort((a, b) => 
    (a.priority || 99) - (b.priority || 99)
  );
  
  // 3. 依次尝试每个策略，直到成功
  for (const strategy of strategies) {
    try {
      const locator = this.strategyToLocator(strategy);
      // 验证定位器是否有效
      if (await this.retry.execute(() => validateLocator(locator))) {
        return locator; // 成功，返回定位器
      }
    } catch (error) {
      // 失败，继续尝试下一个策略
      continue;
    }
  }
  
  // 所有策略都失败，抛出错误
  throw new Error('无法定位元素');
}
```

## 完整 XPath 的影响

### 新增前（旧顺序）

1. testid (1)
2. placeholder (2)
3. name (3)
4. role (4)
5. 普通 XPath (5.8)
6. text (6)
7. css (7)

### 新增后（新顺序）

1. testid (1)
2. placeholder (2)
3. name (3)
4. **完整 XPath (3.5)** ← **新增**
5. role (4)
6. 普通 XPath (5.8)
7. text (6)
8. css (7)

## 实际执行示例

假设录制时生成了以下策略：

```json
{
  "strategies": [
    {
      "type": "testid",
      "value": "submit-button",
      "priority": 1
    },
    {
      "type": "xpath",
      "value": "/html/body/div[@id='app']/div[@class='container']/button[@id='submit']",
      "priority": 3.5
    },
    {
      "type": "xpath",
      "value": "//button[@id='submit']",
      "priority": 5.8
    },
    {
      "type": "css",
      "value": "button#submit",
      "priority": 7
    }
  ]
}
```

### 执行顺序

1. **尝试 testid**: `data-testid="submit-button"`
   - ✅ 成功 → 返回定位器
   - ❌ 失败 → 继续

2. **尝试完整 XPath**: `/html/body/div[@id='app']/div[@class='container']/button[@id='submit']`
   - ✅ 成功 → 返回定位器
   - ❌ 失败 → 继续

3. **尝试普通 XPath**: `//button[@id='submit']`
   - ✅ 成功 → 返回定位器
   - ❌ 失败 → 继续

4. **尝试 CSS**: `button#submit`
   - ✅ 成功 → 返回定位器
   - ❌ 失败 → 抛出错误

## 注意事项

### 1. 优先级调整

系统会根据历史成功率动态调整优先级：
- 如果某个策略经常失败，优先级可能会降低
- 如果某个策略经常成功，优先级可能会提高

### 2. 完整 XPath 的优势

完整 XPath（priority: 3.5）的优势：
- **精准定位**：提供从根节点到目标元素的完整路径
- **高优先级**：优先级高于普通 XPath (5.8) 和 CSS (7)
- **类似爬虫**：与爬虫中使用的 XPath 定位方式一致

### 3. 完整 XPath 的限制

- 如果页面结构完全动态变化，完整 XPath 可能会失效
- 建议优先使用 `data-testid` 或其他稳定属性

## 总结

执行顺序确实发生了变化：

- **新增了完整 XPath（priority: 3.5）**，位于 name (3) 和 role (4) 之间
- 完整 XPath 会在普通 XPath (5.8) 之前执行
- 这样可以优先使用更精准的完整路径定位，提高定位成功率
