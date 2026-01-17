# 命令使用说明

## 1. 录制测试用例

### 命令格式
```bash
npm run record -- --platform <平台> --output <输出路径> --url <起始URL>
```

### 参数说明
- `--platform` 或 `-p`: 平台类型，可选值：`web`、`mobile`、`desktop`，默认为 `web`
- `--output` 或 `-o`: 输出文件路径，默认为 `test-specs/recorded-test.json`
- `--url` 或 `-u`: 起始 URL，默认为 `about:blank`
- `--headless`: 无头模式（可选，默认显示浏览器）

### 使用示例
```bash
# 录制 Web 测试用例
npm run record -- --platform web --output test-specs/web/my-test.json --url http://192.168.9.202:81/login?redirect=/index

# 录制移动端测试用例
npm run record -- --platform mobile --output test-specs/mobile/my-test.json --url https://example.com

# 无头模式录制
npm run record -- --platform web --output test-specs/web/my-test.json --url https://example.com --headless
```

### 操作说明
1. 运行命令后，浏览器会自动打开并导航到指定的 URL
2. 页面右上角会显示录制控制面板
3. 在浏览器中进行操作（点击、输入、导航等）
4. 操作会被自动记录到录制面板中
5. 点击录制面板中的"保存"按钮或按 `Ctrl+C` 停止录制并保存配置

## 2. 运行测试配置

### 命令格式
```bash
npm run test:config -- <配置文件路径> [选项]
```

### 参数说明
- `<配置文件路径>`: 测试配置文件的路径（必需）
- `--headed`: 显示浏览器界面（默认无头模式）
- `--project <项目名>`: 只运行指定项目，可选值：`chromium-web`、`firefox-web`、`webkit-web`、`mobile-iphone`、`mobile-android`、`desktop-app`

### 使用示例
```bash
# 运行测试配置（无头模式）
npm run test:config -- test-specs/web/my-test.json

# 运行测试配置（显示浏览器）
npm run test:config -- test-specs/web/my-test.json --headed

# 运行测试配置（指定浏览器）
npm run test:config -- test-specs/web/my-test.json --headed --project chromium-web

# 运行测试配置（Firefox）
npm run test:config -- test-specs/web/my-test.json --headed --project firefox-web
```

### 注意事项
- 测试配置文件必须是有效的 JSON 格式
- 配置文件必须包含 `name`、`platform` 和 `steps` 字段
- 如果配置文件中包含 `startUrl`，测试会先导航到该 URL
- 测试执行完成后会自动清理临时文件

## 完整工作流程示例

### 1. 录制测试用例
```bash
npm run record -- --platform web --output test-specs/web/login-test.json --url http://192.168.9.202:81/login?redirect=/index
```

### 2. 运行录制的测试
```bash
npm run test:config -- test-specs/web/login-test.json --headed --project chromium-web
```

## 常见问题

### Q: 录制时浏览器没有显示？
A: 检查是否使用了 `--headless` 参数，如果使用了，移除该参数即可。

### Q: 录制时没有看到录制面板？
A: 等待几秒钟，如果仍然没有显示，检查浏览器控制台是否有错误信息。

### Q: 测试执行失败，提示"页面已关闭"？
A: 这通常是因为测试步骤中的某些操作导致页面导航或关闭。可以：
1. 检查测试配置中的 `targetUrl` 是否正确
2. 重新录制测试用例
3. 增加测试超时时间

### Q: 如何查看测试报告？
A: 测试执行完成后，可以使用以下命令查看 HTML 报告：
```bash
npx playwright show-report reports/html-report
```
