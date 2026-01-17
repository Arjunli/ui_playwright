# 重构说明文档

## 重构概述

本次重构参考八爪鱼的设计理念，将代码架构重新组织为分层架构，提高代码的可维护性、可扩展性和稳定性。

## 重构内容

### 1. 核心层 (src/core/)

创建了以下核心模块：

#### LocatorEngine (定位引擎)
- **文件**: `src/core/locator-engine.ts`
- **职责**: 统一管理所有定位策略，提供智能定位和重试机制
- **特性**:
  - 多策略Fallback机制
  - 智能重试
  - 动态优先级调整
  - 页面状态检测

#### ElementFingerprintService (元素指纹服务)
- **文件**: `src/core/element-fingerprint-service.ts`
- **职责**: 计算元素指纹，评估属性稳定性
- **特性**:
  - 多属性组合生成唯一标识
  - 稳定性评分
  - 元素签名生成

#### StabilityScoringService (稳定性评分服务)
- **文件**: `src/core/stability-scoring-service.ts`
- **职责**: 评估定位策略的稳定性，动态调整优先级
- **特性**:
  - 历史成功率记录
  - 动态优先级调整
  - 策略排名

#### SmartRetry (智能重试)
- **文件**: `src/core/smart-retry.ts`
- **职责**: 提供智能重试和容错机制
- **特性**:
  - 自动重试（支持指数退避）
  - 降级策略
  - 多策略执行

#### StrategyGenerator (策略生成器)
- **文件**: `src/core/strategy-generator.ts`
- **职责**: 基于元素信息生成多种定位策略
- **特性**:
  - 元素指纹识别
  - 相对XPath生成
  - 稳定性评估
  - 优先级排序

### 2. 适配层更新

#### LocatorResolver (定位解析适配器)
- **文件**: `src/executor/locator-resolver.ts`
- **更新**: 使用新的 `LocatorEngine` 作为核心引擎
- **兼容性**: 保留旧版方法，但标记为废弃

#### LocatorGenerator (定位生成器)
- **文件**: `src/recorder/locator-generator.ts`
- **更新**: 使用新的 `StrategyGenerator` 生成策略
- **兼容性**: 保留旧版方法，但标记为废弃

## 架构优势

### 1. 分层清晰
- **核心层**: 独立的核心逻辑，不依赖具体实现
- **适配层**: 适配不同平台和框架
- **应用层**: 业务逻辑和用户接口

### 2. 易于扩展
- 新功能通过扩展而非修改实现
- 接口清晰，便于添加新策略
- 模块化设计，便于测试

### 3. 性能优化
- 智能重试机制减少不必要的等待
- 动态优先级调整提高定位成功率
- 历史数据利用优化策略选择

### 4. 稳定性提升
- 多策略Fallback机制提高容错性
- 元素指纹识别提高定位准确性
- 稳定性评分系统优化策略选择

## 使用方式

### 直接使用核心引擎

```typescript
import { LocatorEngine } from './core/locator-engine';

const engine = new LocatorEngine(page);
const locator = await engine.resolve(locatorConfig);
```

### 使用策略生成器

```typescript
import { StrategyGenerator } from './core/strategy-generator';

const generator = new StrategyGenerator();
const config = generator.generateStrategies(elementInfo, parentInfo, siblings);
```

### 使用适配器（推荐）

```typescript
import { LocatorResolver } from './executor/locator-resolver';

const resolver = new LocatorResolver(page);
const locator = await resolver.resolve(locatorConfig);
```

## 迁移指南

### 从旧版迁移

1. **LocatorResolver**: 无需修改，已自动使用新引擎
2. **LocatorGenerator**: 无需修改，已自动使用新生成器
3. **自定义代码**: 可以直接使用新的核心模块

### 废弃的方法

以下方法已标记为废弃，建议迁移到新方法：

- `LocatorResolver.resolveLegacy()` → 使用 `LocatorEngine.resolve()`
- `LocatorGenerator.generateLocatorStrategiesLegacy()` → 使用 `StrategyGenerator.generateStrategies()`

## 测试建议

1. **单元测试**: 为核心模块编写单元测试
2. **集成测试**: 测试适配器与核心模块的集成
3. **回归测试**: 确保现有功能不受影响

## 后续计划

1. ✅ 核心定位引擎
2. ✅ 元素指纹服务
3. ✅ 稳定性评分服务
4. ✅ 智能重试机制
5. ✅ 策略生成器
6. ⏳ 执行引擎优化
7. ⏳ 适配器层完善

## 参考文档

- [架构设计文档](./docs/architecture.md)
- [定位策略改进方案](./docs/locator-strategy-improvements.md)
