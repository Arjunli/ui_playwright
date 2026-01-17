/**
 * 定位策略类型
 */
export type LocatorStrategyType = 
  | 'testid'      // data-testid
  | 'id'          // id 属性
  | 'role'        // role + name
  | 'name'        // name 属性
  | 'placeholder' // placeholder 属性
  | 'text'        // 文本内容
  | 'css'         // CSS 选择器
  | 'xpath'       // XPath
  | 'coordinate'; // 坐标点击 (x,y) - 作为兜底方案

/**
 * 定位策略
 */
export interface LocatorStrategy {
  type: LocatorStrategyType;
  value: string;
  name?: string; // 用于 role 类型
  priority?: number; // 优先级，数字越小优先级越高
}

/**
 * 定位器配置
 */
export interface LocatorConfig {
  strategies: LocatorStrategy[];
  description?: string;
}

/**
 * 测试操作类型
 */
export type TestAction = 
  | 'navigate'    // 导航
  | 'click'       // 点击
  | 'fill'        // 填充输入
  | 'select'      // 选择下拉框
  | 'check'       // 勾选复选框
  | 'uncheck'     // 取消勾选
  | 'hover'       // 悬停
  | 'press'       // 按键
  | 'wait'        // 等待
  | 'screenshot'  // 截图
  | 'assert'      // 断言
  | 'scroll'      // 滚动
  | 'drag'        // 拖拽
  | 'upload';     // 上传文件

/**
 * 测试步骤
 */
export interface TestStep {
  id?: string;
  action: TestAction;
  locator?: LocatorConfig;
  value?: string | number | boolean;
  options?: {
    timeout?: number;
    force?: boolean;
    noWaitAfter?: boolean;
    trial?: boolean;
    [key: string]: any;
  };
  description?: string;
  expectedResult?: string;
  targetUrl?: string; // 点击操作的目标URL（用于降级策略：如果点击失败，直接导航到此URL）
  waitFor?: {
    selector?: string;
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
    timeout?: number;
  };
}

/**
 * 断言类型
 */
export type AssertionType = 
  | 'visible'     // 可见
  | 'hidden'      // 隐藏
  | 'enabled'     // 启用
  | 'disabled'    // 禁用
  | 'text'        // 文本内容
  | 'value'       // 值
  | 'count'       // 数量
  | 'attribute'   // 属性
  | 'url'         // URL
  | 'title';      // 标题

/**
 * 断言步骤
 */
export interface AssertionStep extends TestStep {
  action: 'assert';
  assertionType: AssertionType;
  expectedValue?: string | number | boolean;
  locator: LocatorConfig;
}

/**
 * 平台类型
 */
export type Platform = 'web' | 'mobile' | 'desktop';

/**
 * 测试配置
 */
export interface TestConfig {
  name: string;
  description?: string;
  platform: Platform;
  startUrl?: string;      // 起始 URL（录制时的起始页面）
  environment?: string;
  tags?: string[];
  steps: TestStep[];
  setup?: TestStep[];      // 前置步骤
  teardown?: TestStep[];    // 后置步骤
  data?: Record<string, any>; // 测试数据
  retries?: number;
  timeout?: number;
}

/**
 * 测试套件配置
 */
export interface TestSuiteConfig {
  name: string;
  description?: string;
  tests: TestConfig[];
  parallel?: boolean;
  retries?: number;
  timeout?: number;
}
