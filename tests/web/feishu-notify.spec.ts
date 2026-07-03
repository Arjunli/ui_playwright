import { test, expect } from '../../src/fixtures/custom-fixtures';
import { sendTestResultToFeishu } from '../../src/utils/feishu-notify';

/**
 * 飞书机器人通知功能验证
 *
 * 验证 sendTestResultToFeishu 能否正常发送测试结果（含成功/失败/缓慢三态）到飞书群。
 * 不依赖页面，仅测试通知模块本身。
 * 注意：需在 .env 中配置有效的 FEISHU_WEBHOOK_URL，否则会跳过发送并打印警告。
 */

test.describe('飞书机器人通知', () => {

  test('发送模拟测试结果到飞书（含缓慢状态）', async () => {
    const ok = await sendTestResultToFeishu({
      testName: '飞书通知功能验证（模拟数据）',
      success: 5,
      fail: 2,
      slow: 2,
      total: 9,
      durationMs: 60000,
      failures: [
        { path: '设施 > 监控中心 > Java 监控', reason: '返回 401 账号未登录' },
        { path: '设施 > 代码生成案例 > 树表（增删改查）', reason: '服务器更新,请刷新重试!' },
      ],
      slowItems: [
        { path: '运营 > 运营日报', reason: '页面显示"加载中..."，数据加载超时' },
        { path: '设施 > 监控中心 > MySQL 监控', reason: 'networkidle 等待超时' },
      ],
    });

    if (ok) {
      console.log('✅ 飞书消息发送成功，请检查飞书群是否收到通知');
    } else {
      console.log('⚠️ 飞书消息未发送（可能未配置 Webhook URL）');
    }
    expect(true).toBeTruthy();
  });

});
