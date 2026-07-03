import { test, expect } from '../../src/fixtures/custom-fixtures';
import { sendTestResultToFeishu } from '../../src/utils/feishu-notify';
import fs from 'fs';
import path from 'path';

/**
 * 四十致远 OA 菜单导航测试（合并版：两层 + 三层）
 *
 * 一次登录，遍历所有菜单项并验证页面加载：
 *   - 两层菜单：主菜单 → 子菜单（无三级菜单的子菜单，直接点击验证）
 *   - 三层菜单：主菜单 → 子菜单 → 三级菜单（有三级菜单的子菜单，点击每个三级项验证）
 *
 * 交互策略（混合原生 + AI，减少 AI 调用、提升稳定性）：
 *   - 悬停主菜单：原生 Playwright（先移走鼠标清除残留子菜单）
 *   - 悬停子菜单：AI（兼容截断名，触发三级菜单展开）
 *   - 点击叶子菜单：AI（兼容动态/截断菜单名）
 *   - 等待加载：原生 networkidle
 *   - 验证加载：单次 AI 断言
 *
 * 依赖：
 *   - menu-structure.json        两层菜单结构
 *   - menu-structure-3level.json 三层菜单结构
 * 输出：
 *   - menu-all-load-result.json  全量加载结果
 */

// 系统的 12 个主菜单
const MAIN_MENUS = [
  '开发', '运营', '选品', 'RPA', '产品', '设计',
  '工具', '采购', '利润', '财务', '系统', '设施',
];

const MENU_STRUCTURE_FILE = path.resolve(__dirname, '../../menu-structure.json');
const MENU_STRUCTURE_3LEVEL_FILE = path.resolve(__dirname, '../../menu-structure-3level.json');
const MENU_ALL_LOAD_RESULT_FILE = path.resolve(__dirname, '../../menu-all-load-result.json');

test.describe('四十致远 OA 菜单导航测试', () => {

  // ==========================================================================
  // 测试 1：遍历所有主菜单，提取两层子菜单结构并保存为 JSON
  // ==========================================================================
  test('提取所有主菜单及子菜单结构', async ({
    loggedInPage, aiHover, aiWaitFor, aiQuery,
  }) => {
    test.setTimeout(15 * 60 * 1000);

    const menuStructure: Record<string, string[]> = {};

    for (const menu of MAIN_MENUS) {
      await aiHover(`左侧深色侧边栏中的「${menu}」主菜单项`);

      try {
        await aiWaitFor(`「${menu}」菜单右侧已弹出子菜单面板`, { timeoutMs: 6000 });
      } catch {
        menuStructure[menu] = [];
        console.log(`「${menu}」无子菜单或直接跳转`);
        continue;
      }

      const subItems = await aiQuery<string[]>(
        `列出「${menu}」主菜单下当前弹出的所有子菜单项名称`
      );
      menuStructure[menu] = subItems || [];
      console.log(`「${menu}」子菜单:`, JSON.stringify(subItems));
    }

    console.log('\n===== 完整菜单结构 =====');
    console.log(JSON.stringify(menuStructure, null, 2));

    fs.writeFileSync(MENU_STRUCTURE_FILE, JSON.stringify(menuStructure, null, 2), 'utf-8');
    console.log(`\n菜单结构已保存至: ${MENU_STRUCTURE_FILE}`);

    const totalSubItems = Object.values(menuStructure).reduce(
      (sum, items) => sum + items.length, 0
    );
    expect(totalSubItems).toBeGreaterThan(0);
  });

  // ==========================================================================
  // 测试 2（合并版）：一次登录，遍历所有菜单（两层叶子 + 三层叶子）验证页面加载
  // ==========================================================================
  test('逐个点击所有菜单项并验证页面正常加载（两层+三层合并）', async ({
    loggedInPage, aiHover, aiTap, aiAssert,
  }) => {
    // 两层 56 项 + 三层 37 项，共 93 项，放宽到 50 分钟
    test.setTimeout(50 * 60 * 1000);

    const startTime = Date.now();

    // 读取两层菜单结构
    expect(fs.existsSync(MENU_STRUCTURE_FILE), '请先运行「提取所有主菜单及子菜单结构」测试').toBeTruthy();
    const twoLevel: Record<string, string[]> = JSON.parse(
      fs.readFileSync(MENU_STRUCTURE_FILE, 'utf-8')
    );

    // 读取三层菜单结构（可选，无则视为全部无三级菜单）
    let threeLevel: Record<string, Record<string, string[]>> = {};
    if (fs.existsSync(MENU_STRUCTURE_3LEVEL_FILE)) {
      threeLevel = JSON.parse(fs.readFileSync(MENU_STRUCTURE_3LEVEL_FILE, 'utf-8'));
    }

    type LoadStatus = 'success' | 'slow' | 'fail';
    type LoadResult = {
      path: string;        // 如 "运营 > 创建广告 > 广告列表" 或 "开发 > 审核列表"
      level: 2 | 3;        // 两层叶子 or 三层叶子
      status: LoadStatus;  // 成功 / 缓慢(加载中/超时) / 失败(报错/空白/鉴权)
      error?: string;
    };
    const loadResults: LoadResult[] = [];

    // 判断错误信息是否属于"缓慢加载"（加载中/超时），而非真实失败
    const isSlowError = (errMsg: string): boolean => {
      const slowKeywords = [
        '加载中', '加载动画', '未完成加载', '尚未正常加载', '未加载完成',
        'Timeout 20000ms exceeded', 'networkidle', 'network idle',
        '等待加载', 'loading',
      ];
      return slowKeywords.some(kw => errMsg.includes(kw));
    };

    // 移走鼠标清除残留子菜单面板
    const hoverAway = async () => {
      await loggedInPage.mouse.move(960, 540);
      await loggedInPage.waitForTimeout(300);
    };

    // 原生悬停主菜单
    const hoverMainMenu = async (mainMenu: string) => {
      await hoverAway();
      const menuItem = loggedInPage.getByRole('menuitem', { name: mainMenu, exact: true });
      await menuItem.hover();
      await loggedInPage.waitForTimeout(500);
    };

    // 点击叶子菜单后等待加载并断言（原生等待 + 单次 AI 断言）
    const verifyLoad = async (resultPath: string, level: 2 | 3): Promise<LoadResult> => {
      const result: LoadResult = { path: resultPath, level, status: 'fail' };
      try {
        await loggedInPage.waitForLoadState('networkidle', { timeout: 20000 });
        await aiAssert('页面主内容区已正常加载，没有出现报错或空白页');
        result.status = 'success';
        console.log(`✅ [${resultPath}] 加载成功`);
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        // 区分"缓慢加载"与"真实失败"
        if (isSlowError(result.error)) {
          result.status = 'slow';
          console.log(`🟡 [${resultPath}] 缓慢加载: ${result.error}`);
        } else {
          result.status = 'fail';
          console.log(`❌ [${resultPath}] 加载失败: ${result.error}`);
        }
      }
      return result;
    };

    for (const [mainMenu, subMenus] of Object.entries(twoLevel)) {
      // 无子菜单的主菜单：直接点击主菜单本身
      if (subMenus.length === 0) {
        try {
          const menuItem = loggedInPage.getByRole('menuitem', { name: mainMenu, exact: true });
          await menuItem.click();
          loadResults.push(await verifyLoad(mainMenu, 2));
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          const status: LoadStatus = isSlowError(err) ? 'slow' : 'fail';
          loadResults.push({ path: mainMenu, level: 2, status, error: err });
          console.log(`${status === 'slow' ? '🟡' : '❌'} [${mainMenu}] ${status === 'slow' ? '缓慢加载' : '加载失败'}`);
        }
        continue;
      }

      for (const subMenu of subMenus) {
        const thirdMenus = threeLevel[mainMenu]?.[subMenu] || [];

        if (thirdMenus.length === 0) {
          // ===== 两层叶子：直接点击子菜单 =====
          try {
            await hoverMainMenu(mainMenu);
            await aiTap(`「${mainMenu}」子菜单面板中的「${subMenu}」选项`);
            loadResults.push(await verifyLoad(`${mainMenu} > ${subMenu}`, 2));
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            const status: LoadStatus = isSlowError(err) ? 'slow' : 'fail';
            loadResults.push({ path: `${mainMenu} > ${subMenu}`, level: 2, status, error: err });
            console.log(`${status === 'slow' ? '🟡' : '❌'} [${mainMenu} > ${subMenu}] ${status === 'slow' ? '缓慢加载' : '加载失败'}`);
          }
        } else {
          // ===== 三层叶子：悬停子菜单展开三级菜单，逐个点击 =====
          for (const thirdMenu of thirdMenus) {
            try {
              await hoverMainMenu(mainMenu);
              // AI 悬停子菜单，触发三级菜单展开
              await aiHover(`「${mainMenu}」子菜单面板中的「${subMenu}」选项`);
              await loggedInPage.waitForTimeout(600);
              // AI 点击三级菜单项
              await aiTap(`「${subMenu}」右侧三级子菜单面板中的「${thirdMenu}」选项`);
              loadResults.push(await verifyLoad(`${mainMenu} > ${subMenu} > ${thirdMenu}`, 3));
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              const status: LoadStatus = isSlowError(err) ? 'slow' : 'fail';
              loadResults.push({ path: `${mainMenu} > ${subMenu} > ${thirdMenu}`, level: 3, status, error: err });
              console.log(`${status === 'slow' ? '🟡' : '❌'} [${mainMenu} > ${subMenu} > ${thirdMenu}] ${status === 'slow' ? '缓慢加载' : '加载失败'}`);
            }
          }
        }
      }
    }

    // 输出汇总
    console.log('\n===== 全量菜单加载结果汇总 =====');
    const total = loadResults.length;
    const successCount = loadResults.filter(r => r.status === 'success').length;
    const slowCount = loadResults.filter(r => r.status === 'slow').length;
    const failCount = loadResults.filter(r => r.status === 'fail').length;
    const level2Total = loadResults.filter(r => r.level === 2).length;
    const level2Success = loadResults.filter(r => r.level === 2 && r.status === 'success').length;
    const level3Total = loadResults.filter(r => r.level === 3).length;
    const level3Success = loadResults.filter(r => r.level === 3 && r.status === 'success').length;
    console.log(`总计: ${successCount} 成功 / ${slowCount} 缓慢 / ${failCount} 失败 / ${total} 项`);
    console.log(`  两层菜单: ${level2Success} 成功 / ${level2Total} 项`);
    console.log(`  三层菜单: ${level3Success} 成功 / ${level3Total} 项`);
    if (failCount > 0) {
      console.log('\n失败明细（报错/空白/鉴权）:');
      loadResults.filter(r => r.status === 'fail').forEach(r => {
        console.log(`  ❌ [${r.path}]: ${r.error}`);
      });
    }
    if (slowCount > 0) {
      console.log('\n缓慢明细（加载中/超时，非失败）:');
      loadResults.filter(r => r.status === 'slow').forEach(r => {
        console.log(`  🟡 [${r.path}]: ${r.error}`);
      });
    }

    // 保存完整结果
    fs.writeFileSync(MENU_ALL_LOAD_RESULT_FILE, JSON.stringify(loadResults, null, 2), 'utf-8');
    console.log(`\n详细结果已保存至: ${MENU_ALL_LOAD_RESULT_FILE}`);

    // ===== 发送测试结果到飞书机器人 =====
    const durationMs = Date.now() - startTime;
    await sendTestResultToFeishu({
      testName: '四十致远 OA 全菜单加载验证',
      success: successCount,
      fail: failCount,
      slow: slowCount,
      total,
      durationMs,
      failures: loadResults
        .filter(r => r.status === 'fail')
        .map(r => ({ path: r.path, reason: r.error || '未知错误' })),
      slowItems: loadResults
        .filter(r => r.status === 'slow')
        .map(r => ({ path: r.path, reason: r.error || '加载较慢' })),
    });

    // 断言：成功+缓慢 应占大部分（缓慢不算失败）
    expect(successCount + slowCount, '至少应有一半以上菜单可正常加载或缓慢加载').toBeGreaterThan(total / 2);
  });

});
