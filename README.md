# Midscene AI 自动化测试框架

基于 [MidsceneJS](https://midscenejs.com/) + [Playwright](https://playwright.dev/) 的 AI 驱动 UI 自动化测试框架。

**用自然语言写测试，AI 自动理解和执行。**

## 特性

- 🤖 **AI 驱动** - 用自然语言描述测试步骤，无需手写选择器
- 👁️ **视觉理解** - 基于截图的纯视觉定位，不依赖 DOM 结构
- 🔍 **智能数据提取** - AI 从页面提取结构化数据
- ✅ **智能断言** - 用自然语言描述期望，AI 自动验证
- 🌍 **多环境** - 支持 dev / staging / prod 环境切换
- 📊 **可视化报告** - Midscene AI 操作回放报告 + Playwright HTML 报告

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 AI 模型

编辑 `.env` 文件，设置 AI 模型的 API Key：

```env
# 示例：使用阿里云 Qwen2.5-VL
MIDSCENE_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MIDSCENE_MODEL_API_KEY=sk-your-api-key
MIDSCENE_MODEL_NAME=qwen-vl-max-latest
MIDSCENE_MODEL_FAMILY=qwen2.5-vl
```

支持的模型服务商：
- **火山引擎** - Doubao-Seed / Doubao-Vision / UI-TARS（当前使用 `doubao-seed-2.0-code`，端点 `/api/plan/v3`）
- **阿里云 DashScope** - Qwen2.5-VL / Qwen3-VL / Qwen3.5
- **Google Gemini** - Gemini-3-Pro / Gemini-3-Flash
- **智谱 AI** - GLM-4.6V

> ⚠️ Midscene 需要**视觉模型（VLM）**才能识别截图中的 UI 元素。配置时 `MIDSCENE_MODEL_FAMILY` 必须取以下合法值之一：`doubao-seed`、`doubao-vision`、`gemini`、`qwen2.5-vl`、`qwen3-vl`、`qwen3.5`、`vlm-ui-tars`、`vlm-ui-tars-doubao`、`vlm-ui-tars-doubao-1.5`、`glm-v`、`auto-glm`、`auto-glm-multilingual`、`gpt-5`。

详见 [Midscene 模型配置文档](https://midscenejs.com/model-common-config.html)

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行 Web 测试
npm run test:web

# 运行移动端测试
npm run test:mobile
```

### 4. 查看报告

```bash
npm run report
```

Midscene AI 报告会自动生成在 `midscene_run/report/` 目录下。

## 编写测试

### 核心 API

```typescript
import { test, expect } from '../../src/fixtures/custom-fixtures';

test('示例测试', async ({ page, aiInput, aiTap, aiAssert, aiQuery, aiWaitFor, aiScroll }) => {
  await page.goto('https://example.com');

  // AI 输入
  await aiInput('搜索关键字', '搜索框');

  // AI 点击
  await aiTap('搜索按钮');

  // AI 等待
  await aiWaitFor('搜索结果已加载', { timeoutMs: 5000 });

  // AI 断言
  await aiAssert('页面上显示了搜索结果');

  // AI 提取数据
  const data = await aiQuery<Array<{ name: string; price: number }>>(
    '获取商品名称和价格列表'
  );
  expect(data.length).toBeGreaterThan(0);

  // AI 滚动
  await aiScroll({ scrollType: 'untilBottom' }, '商品列表');
});
```

### 可用的 AI 方法

| 方法 | 用途 | 示例 |
|------|------|------|
| `aiTap` | 点击元素 | `await aiTap('提交按钮')` |
| `aiInput` | 输入文本 | `await aiInput('hello', '搜索框')` |
| `aiAssert` | 断言验证 | `await aiAssert('显示了登录成功提示')` |
| `aiQuery` | 提取数据 | `await aiQuery('获取所有商品价格')` |
| `aiWaitFor` | 等待条件 | `await aiWaitFor('页面加载完成')` |
| `aiScroll` | 滚动页面 | `await aiScroll({scrollType:'down'})` |
| `aiRightClick` | 右键点击 | `await aiRightClick('菜单项')` |
| `ai` | 通用指令 | `await ai('搜索框输入hello并按回车')` |

### 多环境配置

在 `.env` 中配置不同环境的 URL：

```env
ENV=dev

WEB_DEV_URL=https://dev.example.com
WEB_STAGING_URL=https://staging.example.com
WEB_PROD_URL=https://prod.example.com
```

在测试中使用环境配置：

```typescript
test('使用环境配置', async ({ page, environment, aiAssert }) => {
  await page.goto(environment.webUrl);
  await aiAssert('页面正常加载');
});
```

## 项目结构

```
ui_playwright/
├── src/
│   ├── config/             # 环境配置
│   │   ├── environments.ts # 多环境 URL 管理
│   │   └── devices.ts      # 设备配置
│   └── fixtures/           # Playwright + Midscene fixtures
│       └── custom-fixtures.ts
├── tests/                  # 测试用例
│   ├── web/               # Web 端测试
│   └── mobile/            # 移动端测试
├── reports/               # 测试报告 (自动生成)
├── midscene_run/          # Midscene AI 报告 (自动生成)
├── .env                   # 环境变量 & AI 模型配置
├── playwright.config.ts   # Playwright 配置
└── package.json
```

## 参考文档

- [MidsceneJS 官方文档](https://midscenejs.com/)
- [MidsceneJS API 参考](https://midscenejs.com/api.html)
- [模型配置指南](https://midscenejs.com/model-common-config.html)
- [Playwright 文档](https://playwright.dev/)

## 许可证

MIT
