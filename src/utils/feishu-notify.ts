import crypto from 'crypto';

/**
 * 飞书自定义机器人通知工具
 *
 * 文档: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 *       https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/feishu-cards/card-components/content-components
 *
 * 用法:
 *   import { sendFeishuMessage, sendTestResultToFeishu } from '../src/utils/feishu-notify';
 *   await sendTestResultToFeishu({ ... });
 */

const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.FEISHU_WEBHOOK_SECRET || '';

/**
 * 生成飞书加签参数（若配置了 secret）
 * 签名算法: HMAC-SHA256(timestamp + "\n" + secret)
 */
function genSign(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', stringToSign);
  return hmac.digest('base64');
}

/**
 * 向飞书机器人发送 POST 请求
 */
async function postToFeishu(body: Record<string, unknown>): Promise<boolean> {
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('REPLACE_WITH_YOUR_WEBHOOK_TOKEN')) {
    console.warn('[飞书通知] 未配置有效的 FEISHU_WEBHOOK_URL，跳过发送。请在 .env 中设置。');
    return false;
  }

  // 若配置了加签密钥，注入 timestamp + sign
  if (WEBHOOK_SECRET) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = genSign(timestamp, WEBHOOK_SECRET);
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { code?: number; msg?: string; StatusCode?: number };
    if (data.code === 0 || data.StatusCode === 0) {
      console.log('[飞书通知] 发送成功');
      return true;
    }
    console.error('[飞书通知] 发送失败:', JSON.stringify(data));
    return false;
  } catch (e) {
    console.error('[飞书通知] 请求异常:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * 发送纯文本消息
 */
export async function sendText(text: string): Promise<boolean> {
  return postToFeishu({
    msg_type: 'text',
    content: { text },
  });
}

/**
 * 测试结果数据结构
 */
export interface TestResultSummary {
  /** 测试名称 */
  testName: string;
  /** 成功数 */
  success: number;
  /** 失败数（仅报错/空白页等真实异常） */
  fail: number;
  /** 缓慢数（加载中/超时，页面能打开但加载较慢） */
  slow: number;
  /** 总数 */
  total: number;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 失败明细列表（路径 + 原因） */
  failures: { path: string; reason: string }[];
  /** 缓慢明细列表（路径 + 原因） */
  slowItems: { path: string; reason: string }[];
  /** 可选：报告链接 */
  reportUrl?: string;
}

/**
 * 飞书卡片文本节点类型
 */
type TextNode =
  | { tag: 'plain_text'; content: string }
  | { tag: 'lark_md'; content: string };

/**
 * 构造普通文本节点
 */
function plain(text: string): TextNode {
  return { tag: 'plain_text', content: text };
}

/**
 * 构造 Markdown 文本节点
 */
function md(text: string): TextNode {
  return { tag: 'lark_md', content: text };
}

/**
 * 将测试结果格式化为飞书交互卡片（interactive 消息）并发送
 *
 * 卡片布局：
 *   ┌─────────────────────────────────────┐
 *   │  📊 标题（绿/红 根据结果着色）        │
 *   ├─────────────────────────────────────┤
 *   │  成功 ✅ 71    失败 ❌ 6    共 77     │  列表展示
 *   │  通过率 92.2%    耗时 27.9 分钟       │
 *   ├─────────────────────────────────────┤
 *   │  失败明细（仅失败时显示）              │
 *   │  ❌ 运营 > 运营日报                    │
 *   │     原因：加载超时                    │
 *   │  ...                                 │
 *   ├─────────────────────────────────────┤
 *   │  📅 2026-07-03 18:18:39             │  时间戳
 *   └─────────────────────────────────────┘
 */
export async function sendTestResultToFeishu(summary: TestResultSummary): Promise<boolean> {
  const passRate = summary.total > 0
    ? ((summary.success / summary.total) * 100).toFixed(1)
    : '0';
  const durationMin = (summary.durationMs / 60000).toFixed(1);
  // 仅有真实失败才标红；缓慢不算失败
  const hasRealFail = summary.fail > 0;
  const hasSlow = summary.slow > 0;
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // 头部颜色：全过绿、有真实失败红、仅有缓慢黄
  const template = hasRealFail ? 'red' : (hasSlow ? 'yellow' : 'green');

  // 头部标题与图标
  const headerIcon = hasRealFail ? '⚠️' : (hasSlow ? '🟡' : '✅');
  const headerTitle = `${headerIcon} ${summary.testName}`;

  // 卡片内容区块
  const elements: Record<string, unknown>[] = [];

  // —— 统计数据行（用 column_set 四列展示成功/失败/缓慢/总计）——
  elements.push({
    tag: 'column_set',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [{
          tag: 'div',
          fields: [{
            is_short: true,
            text: md(`**✅ 成功**\n${summary.success}`),
          }],
        }],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [{
          tag: 'div',
          fields: [{
            is_short: true,
            text: md(`**❌ 失败**\n${summary.fail}`),
          }],
        }],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [{
          tag: 'div',
          fields: [{
            is_short: true,
            text: md(`**🟡 缓慢**\n${summary.slow}`),
          }],
        }],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [{
          tag: 'div',
          fields: [{
            is_short: true,
            text: md(`** 总计**\n${summary.total}`),
          }],
        }],
      },
    ],
  });

  // 分隔线
  elements.push({ tag: 'hr' });

  // —— 通过率与耗时 ——
  elements.push({
    tag: 'div',
    fields: [
      { is_short: true, text: md(`**通过率**\n${passRate}%`) },
      { is_short: true, text: md(`**耗时**\n${durationMin} 分钟`) },
    ],
  });

  // —— 失败明细（真实异常：报错/空白/鉴权失败）——
  if (summary.failures.length > 0) {
    elements.push({ tag: 'hr' });

    elements.push({
      tag: 'div',
      text: md(`**🚨 失败明细（${summary.failures.length} 项）**`),
    });

    for (const f of summary.failures) {
      elements.push({
        tag: 'div',
        text: md(`❌ **${f.path}**\n　　原因：${f.reason}`),
      });
    }
  }

  // —— 缓慢明细（加载中/超时，页面能打开但加载较慢，不算失败）——
  if (summary.slowItems.length > 0) {
    elements.push({ tag: 'hr' });

    elements.push({
      tag: 'div',
      text: md(`**🟡 缓慢加载（${summary.slowItems.length} 项，非失败）**`),
    });

    for (const s of summary.slowItems) {
      elements.push({
        tag: 'div',
        text: md(`⏳ **${s.path}**\n　　原因：${s.reason}`),
      });
    }
  }

  // 分隔线
  elements.push({ tag: 'hr' });

  // —— 时间戳 ——
  elements.push({
    tag: 'note',
    elements: [plain(`📅 ${timeStr}`)],
  });

  // —— 报告链接 ——
  if (summary.reportUrl) {
    elements.push({
      tag: 'action',
      actions: [{
        tag: 'button',
        text: plain('📊 查看详细报告'),
        url: summary.reportUrl,
        type: 'primary',
      }],
    });
  }

  // 组装卡片
  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: plain(headerTitle),
      template,
    },
    elements,
  };

  return postToFeishu({
    msg_type: 'interactive',
    card,
  });
}
