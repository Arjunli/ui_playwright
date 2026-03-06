import { test, expect } from '../../src/fixtures/custom-fixtures';

/**
 * Midscene AI 驱动的测试示例
 *
 * 所有交互都通过自然语言描述，Midscene AI 自动完成：
 * - aiTap:    AI 智能点击（描述你要点击什么）
 * - aiInput:  AI 智能输入（描述输入内容和目标）
 * - aiAssert: AI 智能断言（描述期望看到什么）
 * - aiQuery:  AI 智能数据提取（描述要提取什么数据）
 * - aiWaitFor: AI 智能等待（描述等待什么条件满足）
 * - aiScroll:  AI 智能滚动
 */

test.describe('Midscene AI 搜索测试', () => {

    test('AI 驱动搜索 eBay 商品', async ({ page, aiInput, aiTap, aiWaitFor, aiAssert, aiQuery }) => {
        await page.setViewportSize({ width: 1280, height: 768 });
        await page.goto('https://www.ebay.com');
        await page.waitForLoadState('networkidle');

        // 用自然语言描述所有操作，AI 自动理解并执行
        await aiInput('Headphones', 'search box');
        await aiTap('search button');
        await aiWaitFor('there are search results on the page', { timeoutMs: 10000 });
        await aiAssert('there are product listings on the page');

        // AI 从页面提取结构化数据
        const items = await aiQuery<Array<{ title: string; price: string }>>(
            'get the first 3 product titles and prices from search results'
        );

        console.log('搜索结果:', JSON.stringify(items, null, 2));
        expect(items).toBeTruthy();
        expect(items.length).toBeGreaterThan(0);
    });

});
