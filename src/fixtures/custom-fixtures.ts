import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { getEnvironment, type EnvironmentConfig } from '../config/environments';

/**
 * 扩展 fixtures 类型：Midscene AI + 环境配置
 */
type CustomFixtures = PlayWrightAiFixtureType & {
  /** 当前环境配置（dev/staging/prod） */
  environment: EnvironmentConfig;
};

export const test = base.extend<CustomFixtures>({
  // 注入 Midscene AI fixtures
  // 提供: ai, aiQuery, aiAssert, aiTap, aiInput, aiScroll, aiWaitFor, aiRightClick,
  //       agentForPage, recordToReport
  ...PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 2000,
  }),

  // 环境配置 fixture
  environment: async ({ }, use) => {
    const env = getEnvironment();
    await use(env);
  },
});

export { expect } from '@playwright/test';
