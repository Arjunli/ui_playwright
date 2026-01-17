import { test, expect } from '../src/fixtures/custom-fixtures';

test.describe('Web 测试示例', () => {
  test('登录测试示例', async ({ webPage, environment }) => {
    // 导航到登录页面
    await webPage.navigate(`${environment.webUrl}/login`);

    // 输入用户名
    await webPage.fill('#username', 'test@example.com');

    // 输入密码
    await webPage.fill('#password', 'password123');

    // 点击登录按钮
    await webPage.click('button[type="submit"]');

    // 等待导航
    await webPage.waitForVisible('.dashboard');

    // 断言
    await webPage.expectUrl(/dashboard/);
    await webPage.expectText('.welcome-message', /欢迎/);
  });

  test('搜索功能示例', async ({ webPage }) => {
    await webPage.navigate('https://example.com');

    // 搜索
    await webPage.fill('input[type="search"]', 'Playwright');
    await webPage.press('input[type="search"]', 'Enter');

    // 等待结果
    await webPage.waitForVisible('.search-results');

    // 断言结果存在
    await webPage.expectVisible('.search-results');
  });
});
