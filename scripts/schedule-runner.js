/**
 * 定时执行 Playwright 测试（配置见 .env 中 SCHEDULE_* 变量）
 *
 * 用法: npm run schedule:menu-load
 * 停止: Ctrl+C
 */
const { spawn } = require('child_process');
const { config } = require('dotenv');
const path = require('path');

config({ path: path.resolve(__dirname, '../.env') });

function loadScheduleConfig() {
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

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0) return `${h} 小时`;
  return `${m} 分钟`;
}

function timestamp() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function runTest(cfg) {
  return new Promise((resolve) => {
    const args = [
      'playwright',
      'test',
      cfg.testFile,
      `--project=${cfg.project}`,
      '-g',
      cfg.testGrep,
    ];

    console.log(`\n[${timestamp()}] 开始执行: npx ${args.join(' ')}`);

    const child = spawn('npx', args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    child.on('close', (code) => {
      console.log(`[${timestamp()}] 执行结束, exit code: ${code ?? 'unknown'}`);
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      console.error(`[${timestamp()}] 启动失败:`, err.message);
      resolve(1);
    });
  });
}

async function main() {
  const cfg = loadScheduleConfig();

  if (!cfg.enabled) {
    console.log('SCHEDULE_ENABLED=false，定时任务未启用。单次执行请用: npm run test:menu-load');
    process.exit(0);
  }

  console.log('===== Playwright 定时任务 =====');
  console.log(`间隔: ${formatDuration(cfg.intervalMs)}`);
  console.log(`测试: ${cfg.testFile}`);
  console.log(`过滤: -g "${cfg.testGrep}"`);
  console.log(`项目: ${cfg.project}`);
  console.log(`启动即跑: ${cfg.runOnStart ? '是' : '否'}`);
  console.log('按 Ctrl+C 停止\n');

  let running = false;

  const tick = async () => {
    if (running) {
      console.log(`[${timestamp()}] 上一轮仍在运行，跳过本次调度`);
      return;
    }

    running = true;
    try {
      await runTest(cfg);
    } finally {
      running = false;
      console.log(`[${timestamp()}] 下次执行: ${formatDuration(cfg.intervalMs)} 后`);
    }
  };

  if (cfg.runOnStart) {
    await tick();
  }

  setInterval(tick, cfg.intervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
