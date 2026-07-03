import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env') });

export interface ScheduleConfig {
  /** 是否启用定时任务 */
  enabled: boolean;
  /** 执行间隔（毫秒） */
  intervalMs: number;
  /** 启动 scheduler 时是否立即跑第一次 */
  runOnStart: boolean;
  /** 测试文件路径 */
  testFile: string;
  /** Playwright -g 过滤正则 */
  testGrep: string;
  /** Playwright project 名称 */
  project: string;
}

/**
 * 从 .env 读取定时任务配置（SCHEDULE_* 变量）
 */
export function getScheduleConfig(): ScheduleConfig {
  const hours = parseFloat(process.env.SCHEDULE_INTERVAL_HOURS || '2');
  const intervalMs = process.env.SCHEDULE_INTERVAL_MS
    ? Number(process.env.SCHEDULE_INTERVAL_MS)
    : hours * 60 * 60 * 1000;

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('SCHEDULE_INTERVAL_HOURS / SCHEDULE_INTERVAL_MS 必须是正数');
  }

  return {
    enabled: process.env.SCHEDULE_ENABLED !== 'false',
    intervalMs,
    runOnStart: process.env.SCHEDULE_RUN_ON_START !== 'false',
    testFile: process.env.SCHEDULE_TEST_FILE || 'tests/web/menu-navigation.spec.ts',
    testGrep: process.env.SCHEDULE_TEST_GREP || '逐个点击所有菜单项',
    project: process.env.SCHEDULE_PROJECT || 'chromium-web',
  };
}
