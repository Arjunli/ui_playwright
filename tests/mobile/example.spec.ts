import { test, expect } from '../../src/fixtures/custom-fixtures';

test.describe('移动端测试示例', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
  });

  test('移动端登录测试', async ({ mobilePage, environment }) => {
    // 导航到移动端登录页面
    await mobilePage.navigate(`${environment.mobileUrl}/login`);

    // 输入用户名
    await mobilePage.fill('#username', 'test@example.com');

    // 输入密码
    await mobilePage.fill('#password', 'password123');

    // 点击登录按钮
    await mobilePage.click('button[type="submit"]');

    // 等待并断言
    await mobilePage.waitForVisible('.mobile-dashboard');
    await mobilePage.expectUrl(/dashboard/);
  });
});
