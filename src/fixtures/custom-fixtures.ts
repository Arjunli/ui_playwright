import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { getEnvironment, type EnvironmentConfig } from '../config/environments';

/**
 * 四十致远 OA 登录凭证（可后续迁移到 .env）
 */
const ZY_CREDENTIALS = {
  team: '租户1',
  username: 'adminljz',
  password: '123456',
};

/**
 * 扩展 fixtures 类型：Midscene AI + 环境配置 + 已登录页面
 */
type CustomFixtures = PlayWrightAiFixtureType & {
  /** 当前环境配置（dev/staging/prod） */
  environment: EnvironmentConfig;
  /**
   * 已完成登录的 Page —— 自动执行登录流程，
   * 使用后页面已处于系统主页，可直接做菜单导航等操作。
   */
  loggedInPage: import('playwright').Page;
};

export const test = base.extend<CustomFixtures>({

  // 注入 Midscene AI fixtures
  // 提供: ai, aiAct, aiTap, aiHover, aiInput, aiKeyboardPress, aiScroll, aiQuery,
  //       aiAssert, aiWaitFor, aiLocate, aiRightClick, aiDoubleClick, aiAsk,
  //       aiString, aiBoolean, aiNumber, runYaml, agentForPage, recordToReport ...
  ...PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 2000,
  }),

  // 环境配置 fixture
  environment: async ({ }, use) => {
    const env = getEnvironment();
    await use(env);
  },

  // 已登录页面 fixture —— 复用登录流程，避免每个测试重复编写
  loggedInPage: async ({ page, environment, aiInput, aiTap, aiWaitFor }, use) => {
    await page.goto(`${environment.webUrl}/login?redirect=/index`);
    await page.waitForLoadState('networkidle');

    await aiInput(ZY_CREDENTIALS.team, '团队名称输入框');
    await aiInput(ZY_CREDENTIALS.username, '用户名输入框');
    await aiInput(ZY_CREDENTIALS.password, '密码输入框');
    await aiTap('登录按钮');
    await aiWaitFor('页面已经登录成功并跳转到主页', { timeoutMs: 30000 });

    // 登录成功后系统会弹出公告/通知弹窗，必须先关闭才能点击菜单等元素。
    // 使用 Playwright 原生定位器快速关闭（比 AI 调用快得多，更稳定）。
    // 弹窗结构：dialog 内有 "关闭此对话框"(X 按钮) 和 "关 闭"(底部按钮) 两个关闭入口。
    const dialog = page.getByRole('dialog');
    // 等待弹窗出现（最多 5 秒，不出现则跳过）
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // 循环关闭可能连续出现的多个弹窗（最多尝试 5 次）
    for (let i = 0; i < 5; i++) {
      if (!(await dialog.isVisible().catch(() => false))) break;
      // 优先点击底部"关 闭"按钮，其次点击右上角 X
      const closeBtn = dialog.locator('button', { hasText: '关 闭' });
      const xBtn = dialog.locator('button[aria-label="关闭此对话框"]');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      } else if (await xBtn.isVisible().catch(() => false)) {
        await xBtn.click();
      } else {
        // 未找到已知关闭按钮，尝试按 Escape 键关闭
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(500);
    }

    await use(page);
  },
});

export { expect } from '@playwright/test';
