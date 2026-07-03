import { test, expect } from '../../src/fixtures/custom-fixtures';

/**
 * 40zhiyuan 登录页 AI 测试
 *
 * 目标：验证
 * 1. 火山引擎 Doubao AI 模型连接正常
 * 2. 登录页能正常加载
 * 3. AI 能识别页面元素（断言、查询、交互）
 *
 * 登录页 URL: https://40zhiyuan.com/login?redirect=/index
 */

test.describe('40zhiyuan 登录页 AI 测试', () => {

  test('登录页正常加载并包含登录表单', async ({ page, environment, aiAssert }) => {
    // 访问登录页
    await page.goto(`${environment.webUrl}/login?redirect=/index`);
    await page.waitForLoadState('networkidle');

    // AI 验证页面元素 —— 验证 AI 连接 + 页面加载
    await aiAssert('页面上有一个登录表单');
    await aiAssert('页面上有用户名输入框和密码输入框');
  });

  test('登录页元素识别与数据提取', async ({ page, environment, aiAssert, aiQuery }) => {
    await page.goto(`${environment.webUrl}/login?redirect=/index`);
    await page.waitForLoadState('networkidle');

    // AI 识别页面上可交互的元素
    await aiAssert('页面上有登录按钮');

    // AI 提取页面信息，验证数据提取能力
    const pageInfo = await aiQuery<{
      hasUsernameField: boolean;
      hasPasswordField: boolean;
      hasLoginButton: boolean;
      otherElements: string[];
    }>('识别页面上是否有用户名输入框、密码输入框、登录按钮，并列出其他可见元素');

    console.log('登录页信息:', JSON.stringify(pageInfo, null, 2));
    expect(pageInfo).toBeTruthy();
  });

  test('AI 模拟输入登录信息', async ({ page, environment, aiInput, aiAssert }) => {
    await page.goto(`${environment.webUrl}/login?redirect=/index`);
    await page.waitForLoadState('networkidle');

    // AI 在用户名输入框输入测试账号
    await aiInput('test@example.com', '用户名输入框');

    // AI 在密码输入框输入测试密码
    await aiInput('Test@123456', '密码输入框');

    // 验证输入框已被填充
    await aiAssert('用户名输入框中显示了 test@example.com');
  });

  test('真实登录 40zhiyuan OA 系统', async ({ page, environment, aiInput, aiTap, aiWaitFor, aiAssert, aiQuery }) => {
    // 访问登录页
    await page.goto(`${environment.webUrl}/login?redirect=/index`);
    await page.waitForLoadState('networkidle');

    // 依次填写：团队名称、账号、密码
    await aiInput('租户1', '团队名称输入框');
    await aiInput('adminljz', '用户名输入框');
    await aiInput('123456', '密码输入框');

    // 点击登录按钮
    await aiTap('登录按钮');

    // 等待登录完成跳转
    await aiWaitFor('页面已经登录成功并跳转到主页', { timeoutMs: 30000 });

    // 验证已进入系统主页
    await aiAssert('当前页面是系统主页（不再是登录页）');

    // 提取登录后的页面信息，确认登录状态
    const homeInfo = await aiQuery<{
      url: string;
      title: string;
      mainFeatures: string[];
    }>('获取当前页面的 URL、页面标题，以及页面上可见的主要功能菜单');

    console.log('登录后页面信息:', JSON.stringify(homeInfo, null, 2));
    expect(homeInfo).toBeTruthy();
  });

});
