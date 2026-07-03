import { test, expect } from '../../src/fixtures/custom-fixtures';
import fs from 'fs';
import path from 'path';

/**
 * 探测三层菜单结构（主菜单→子菜单→三级子菜单）
 *
 * 优化策略：
 *   - 已探测的结果硬编码，避免重复扫描（首次运行已确认前 30 项）
 *   - 仅扫描剩余未探测项（工具>业务通知 起 ~ 26 项）
 *   - 主菜单悬停用原生 Playwright（快），子菜单悬停 + 三级检测用单次 AI 查询
 *   - 每次悬停前先移走鼠标，清除残留子菜单面板
 *
 * 输出 menu-structure-3level.json（三层结构）
 */

const MENU_STRUCTURE_3LEVEL_FILE = path.resolve(__dirname, '../../menu-structure-3level.json');

// 首次运行已确认的结果（控制台输出），硬编码避免重复扫描
// key = "主菜单>子菜单"，value = 三级菜单名[]（空数组=无三级菜单）
const KNOWN_RESULTS: Record<string, string[]> = {
  '开发>审核列表': [],
  '开发>开发表': [],
  '开发>已提设计任务': [],
  '开发>开发投产统计': [],
  '运营>运营日报': [],
  '运营>运营目标管理': [],
  '运营>智能文案V2(Be...': [],
  '运营>智能文案': [],
  '运营>补货建议': [],
  '运营>创建广告': ['广告列表', '广告模板管理'],
  '运营>广告策略管理': ['广告分析', '策略列表'],
  '运营>广告工具': ['(梁战骏)CPC竞...'],
  '运营>违禁词库': [],
  '选品>ABA选品': [],
  '选品>BS每日榜单': [],
  '选品>AI选品': [],
  'RPA>任务市场': [],
  'RPA>我的任务': [],
  'RPA>机器人视图': [],
  '产品>产品分析(郭长...': [],
  '产品>规则管理': [],
  '设计>任务列表': [],
  '工具>表模板中心': [],
  '工具>店铺管理': [],
  '工具>管理费用设置': [],
  '工具>汇率设置': [],
  '工具>风控中心': ['综合风控检测', '检测记录'],
  '工具>飞书应用授权': [],
};

// 两层结构（用于遍历）
const TWO_LEVEL: Record<string, string[]> = {
  '开发': ['审核列表', '开发表', '已提设计任务', '开发投产统计'],
  '运营': ['运营日报', '运营目标管理', '智能文案V2(Be...', '智能文案', '补货建议', '创建广告', '广告策略管理', '广告工具', '违禁词库'],
  '选品': ['ABA选品', 'BS每日榜单', 'AI选品'],
  'RPA': ['任务市场', '我的任务', '机器人视图'],
  '产品': ['产品分析(郭长...', '规则管理'],
  '设计': ['任务列表'],
  '工具': ['表模板中心', '店铺管理', '管理费用设置', '汇率设置', '风控中心', '飞书应用授权', '业务通知'],
  '采购': ['补货申请表'],
  '利润': ['利润模板中心'],
  '财务': ['利润报表'],
  '系统': ['租户管理', '用户管理', '充值管理', '角色管理', '菜单管理', '部门管理', '岗位管理', '字典管理', '消息中心', '审计日志', 'OAuth 2.0', '三方登录', '地区管理'],
  '设施': ['代码生成', '代码生成案例', '数据源配置', '表单构建', 'API 接口', 'API 日志', 'WebSocket', '文件管理', '定时任务', '配置管理', '监控中心'],
};

test('探测三层菜单结构（主菜单→子菜单→三级子菜单）', async ({
  loggedInPage, aiHover, aiQuery,
}) => {
  test.setTimeout(25 * 60 * 1000);

  // 结果容器：主菜单 -> { 子菜单名 -> 三级菜单名[] }
  const threeLevel: Record<string, Record<string, string[]>> = {};

  // 移走鼠标清除残留子菜单
  const hoverAway = async () => {
    await loggedInPage.mouse.move(960, 540);
    await loggedInPage.waitForTimeout(300);
  };

  for (const [mainMenu, subMenus] of Object.entries(TWO_LEVEL)) {
    threeLevel[mainMenu] = {};

    for (const subMenu of subMenus) {
      const key = `${mainMenu}>${subMenu}`;

      // 已知结果直接使用，跳过 AI 探测
      if (key in KNOWN_RESULTS) {
        threeLevel[mainMenu][subMenu] = KNOWN_RESULTS[key];
        if (KNOWN_RESULTS[key].length > 0) {
          console.log(`✅ [${mainMenu} > ${subMenu}] 有三级菜单(已知): ${JSON.stringify(KNOWN_RESULTS[key])}`);
        }
        continue;
      }

      // 未探测项：用 AI 探测
      threeLevel[mainMenu][subMenu] = [];

      try {
        // 1. 原生悬停主菜单
        await hoverAway();
        const menuItem = loggedInPage.getByRole('menuitem', { name: mainMenu, exact: true });
        await menuItem.hover();
        await loggedInPage.waitForTimeout(500);

        // 2. AI 悬停子菜单项
        await aiHover(`「${mainMenu}」子菜单面板中的「${subMenu}」选项`);
        await loggedInPage.waitForTimeout(600);

        // 3. 单次 AI 查询：检测是否有三级菜单并提取（合并检测+提取为一次调用）
        const thirdLevelItems = await aiQuery<string[] | null>(
          `观察「${subMenu}」右侧是否弹出了下一级（三级）子菜单面板。如果有，列出所有三级菜单项名称；如果没有弹出三级菜单，返回 null。`
        );

        if (thirdLevelItems && thirdLevelItems.length > 0) {
          threeLevel[mainMenu][subMenu] = thirdLevelItems;
          console.log(`✅ [${mainMenu} > ${subMenu}] 有三级菜单: ${JSON.stringify(thirdLevelItems)}`);
        } else {
          console.log(`⬜ [${mainMenu} > ${subMenu}] 无三级菜单`);
        }
      } catch (e) {
        console.log(`⚠️ [${mainMenu} > ${subMenu}] 探测出错: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 输出完整三层结构
  console.log('\n===== 三层菜单结构 =====');
  console.log(JSON.stringify(threeLevel, null, 2));

  fs.writeFileSync(MENU_STRUCTURE_3LEVEL_FILE, JSON.stringify(threeLevel, null, 2), 'utf-8');
  console.log(`\n三层菜单结构已保存至: ${MENU_STRUCTURE_3LEVEL_FILE}`);

  // 统计
  const thirdLevelCount = Object.values(threeLevel).reduce(
    (sum, subs) => sum + Object.values(subs).reduce((s, items) => s + items.length, 0),
    0
  );
  console.log(`\n共发现 ${thirdLevelCount} 个三级菜单项`);
  expect(thirdLevelCount).toBeGreaterThan(0);
});
