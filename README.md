# Playwright 通用测试框架

一个功能强大的 Playwright UI 自动化测试框架，支持录制生成测试用例、多环境、多平台（Web/移动/桌面），集成 Allure 报告。

## 特性

- 🎬 **无代码测试**：通过录制自动生成测试用例，支持配置文件和代码两种方式
- 🎯 **智能定位**：自动生成多种定位策略，按优先级排序，提高元素定位稳定性
- 🌍 **多环境支持**：支持 dev、staging、prod 等多环境配置
- 📱 **多平台支持**：统一接口支持 Web、移动端、桌面端测试
- 📊 **Allure 报告**：集成 Allure，生成美观的测试报告
- 🔄 **配置与代码互转**：支持配置文件与 TypeScript 代码相互转换
- 🛠️ **Page Object Model**：支持 POM 模式，提高代码复用性

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置你的环境 URL 和测试账号。

### 运行测试

```bash
# 运行所有测试
npm test

# 运行 Web 测试
npm run test:web

# 运行移动端测试
npm run test:mobile

# 运行桌面端测试
npm run test:desktop
```

### 生成报告

```bash
# 生成并打开 Allure 报告
npm run report

# 仅生成报告
npm run report:generate
```

## 使用方式

### 方式一：录制生成配置（无代码）

**1. 启动录制器**

```bash
npm run record -- --platform web --output test-specs/web/my-test.json --url https://example.com
```

**2. 使用可视化界面**

启动后，页面右上角会显示一个录制控制面板，包含：

- **实时操作列表**：显示所有捕获的操作，包括操作类型、时间戳和详细信息
- **暂停/继续按钮**：可以随时暂停或继续录制
- **清空按钮**：清空所有已捕获的操作
- **保存按钮**：保存当前配置到文件
- **停止录制按钮**：停止录制并保存配置
- **操作计数**：显示当前已捕获的操作数量

**3. 在浏览器中操作**

- 录制器会自动捕获所有操作（点击、输入、导航等）
- 每个操作会实时显示在控制面板中
- 自动生成智能定位策略
- 可以随时暂停录制，避免捕获不需要的操作

**4. 停止录制**

有两种方式停止录制：
- 点击控制面板中的"停止录制"按钮
- 按 `Ctrl+C` 停止录制

配置会自动保存到指定文件。

**5. 执行配置测试**

```bash
npm run test:config -- test-specs/web/my-test.json
```

### 方式二：手动编辑配置

编辑 `test-specs/web/login-example.json`，添加/修改测试步骤：

```json
{
  "name": "登录测试",
  "platform": "web",
  "steps": [
    {
      "action": "navigate",
      "value": "https://example.com/login"
    },
    {
      "action": "fill",
      "locator": {
        "strategies": [
          {"type": "id", "value": "username", "priority": 1}
        ]
      },
      "value": "test@example.com"
    }
  ]
}
```

### 方式三：配置转代码

```bash
npm run convert -- --input test-specs/web/login-example.json --output tests/web/login.spec.ts --type config-to-code
```

### 方式四：代码方式（传统）

```typescript
import { test, expect } from '../src/fixtures/custom-fixtures';

test('登录测试', async ({ webPage }) => {
  await webPage.navigate('https://example.com/login');
  await webPage.fill('#username', 'test@example.com');
  await webPage.fill('#password', 'password123');
  await webPage.click('button[type="submit"]');
  await webPage.expectUrl(/dashboard/);
});
```

### 方式五：使用 Playwright Codegen

```bash
# 使用 Playwright Codegen 录制
npx playwright codegen https://example.com

# 将生成的代码转为配置
npm run convert:codegen -- output.spec.ts
```

## 智能定位策略

框架会自动生成多种定位策略，按优先级排序：

1. **data-testid**：最稳定，专门用于测试
2. **id**：唯一标识符
3. **role + name**：语义化定位（推荐）
4. **name 属性**：表单元素
5. **placeholder**：输入框占位符
6. **text 内容**：可见文本
7. **CSS 选择器**：class、标签等
8. **XPath**：最后备选方案

执行时会按优先级尝试，如果主定位失败，会自动降级到下一个策略。

## 测试配置格式

测试配置使用 JSON 格式：

```json
{
  "name": "测试名称",
  "description": "测试描述",
  "platform": "web",
  "environment": "dev",
  "tags": ["smoke", "regression"],
  "steps": [
    {
      "action": "navigate",
      "value": "https://example.com"
    },
    {
      "action": "click",
      "locator": {
        "strategies": [
          {"type": "testid", "value": "button", "priority": 1},
          {"type": "role", "value": "button", "name": "提交", "priority": 2}
        ]
      }
    }
  ],
  "setup": [],
  "teardown": [],
  "retries": 1,
  "timeout": 30000
}
```

## 支持的操作

- `navigate` - 导航到页面
- `click` - 点击元素
- `fill` - 填充输入框
- `select` - 选择下拉框选项
- `check` - 勾选复选框
- `uncheck` - 取消勾选
- `hover` - 悬停元素
- `press` - 按键
- `wait` - 等待
- `screenshot` - 截图
- `assert` - 断言
- `scroll` - 滚动
- `drag` - 拖拽
- `upload` - 上传文件

## 多环境配置

在 `.env` 文件中配置不同环境的 URL：

```env
ENV=dev

WEB_DEV_URL=https://dev.example.com
WEB_STAGING_URL=https://staging.example.com
WEB_PROD_URL=https://prod.example.com

MOBILE_DEV_URL=https://m.dev.example.com
MOBILE_STAGING_URL=https://m.staging.example.com
MOBILE_PROD_URL=https://m.prod.example.com
```

在测试配置中指定环境：

```json
{
  "environment": "dev"
}
```

## 项目结构

```
ui_playwright/
├── src/
│   ├── pages/              # Page Object 模型
│   ├── fixtures/           # Playwright fixtures
│   ├── recorder/           # 录制器模块
│   ├── executor/           # 执行引擎
│   ├── converter/          # 转换工具
│   ├── utils/              # 工具类
│   ├── config/             # 配置管理
│   └── types/              # TypeScript 类型定义
├── tests/                   # 测试用例
│   ├── web/
│   ├── mobile/
│   └── desktop/
├── test-specs/             # 录制的测试配置
├── scripts/                # 脚本工具
└── reports/                # 测试报告
```

## 最佳实践

1. **使用 data-testid**：在应用中添加 `data-testid` 属性，这是最稳定的定位方式
2. **环境隔离**：不同环境使用不同的配置文件
3. **测试数据管理**：将测试数据放在 `test-data/` 目录
4. **Page Object Model**：对于复杂页面，使用 POM 模式封装
5. **录制后优化**：录制生成的配置可以手动优化，添加断言和等待
6. **版本控制**：将测试配置纳入版本控制，便于团队协作

## 命令行工具

### 录制工具

```bash
npm run record [选项]

选项:
  -p, --platform <platform>  平台类型 (web|mobile|desktop)
  -o, --output <path>         输出文件路径
  -u, --url <url>             起始 URL
  --headless                  无头模式
```

### 转换工具

```bash
npm run convert [选项]

选项:
  -i, --input <path>          输入文件路径
  -o, --output <path>         输出文件路径
  -t, --type <type>           转换类型 (config-to-code|code-to-config)
```

## 故障排除

### 定位失败

如果元素定位失败，检查：
1. 元素是否已加载（添加等待）
2. 定位策略是否正确
3. 是否有多个匹配的元素

### 录制不工作

确保：
1. 浏览器已正确启动
2. 页面已加载完成
3. 没有其他脚本干扰

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
