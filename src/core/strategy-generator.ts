import { Page } from '@playwright/test';
import type { LocatorStrategy, LocatorConfig } from '../types/test-config';
import type { ElementInfo } from '../recorder/locator-generator';
import { ElementFingerprintService } from './element-fingerprint-service';
import { StabilityScoringService } from './stability-scoring-service';

/**
 * 策略生成器（参考八爪鱼的多策略生成）
 * 基于元素信息生成多种定位策略，按稳定性排序
 */
export class StrategyGenerator {
  private fingerprintService: ElementFingerprintService;
  private stabilityService: StabilityScoringService;

  constructor() {
    this.fingerprintService = new ElementFingerprintService();
    this.stabilityService = new StabilityScoringService();
  }

  /**
   * 从元素信息生成定位策略（核心方法）
   * 按照八爪鱼的优先级：testid > id > name > placeholder > role > text > css > xpath
   */
  generateStrategies(elementInfo: ElementInfo, parentInfo?: any, siblings?: any[]): LocatorConfig {
    const strategies: LocatorStrategy[] = [];

    // 1. data-testid (最稳定，priority: 1)
    if (elementInfo.testId) {
      strategies.push({
        type: 'testid',
        value: elementInfo.testId,
        priority: 1,
      });
    }

    // 2. id (priority: 2，但需要检查是否是动态的)
    if (elementInfo.id && !/el-id-\d+-\d+/.test(elementInfo.id)) {
      strategies.push({
        type: 'id',
        value: elementInfo.id,
        priority: 2,
      });
    }

    // 3. role + name (语义化，priority: 3)
    if (elementInfo.role) {
      strategies.push({
        type: 'role',
        value: elementInfo.role,
        name: elementInfo.text || elementInfo.name,
        priority: 3,
      });
    }

    // 4. name 属性 (priority: 4)
    if (elementInfo.name) {
      strategies.push({
        type: 'name',
        value: elementInfo.name,
        priority: 4,
      });
    }

    // 5. placeholder (priority: 5)
    if (elementInfo.placeholder) {
      strategies.push({
        type: 'placeholder',
        value: elementInfo.placeholder,
        priority: 5,
      });
    }

    // 6. XPath (基于元素属性，priority: 5.8，优先于 CSS)
    const xpath = this.generateXPath(elementInfo, parentInfo, siblings);
    if (xpath) {
      strategies.push({
        type: 'xpath',
        value: xpath,
        priority: 5.8,
      });
    }

    // 7. text 内容 (priority: 6)
    if (elementInfo.text && elementInfo.text.trim().length > 0 && elementInfo.text.trim().length < 50) {
      strategies.push({
        type: 'text',
        value: elementInfo.text.trim(),
        priority: 6,
      });
    }

    // 8. CSS 选择器 (最后备选，priority: 7)
    const cssSelector = this.generateCssSelector(elementInfo, parentInfo);
    if (cssSelector) {
      strategies.push({
        type: 'css',
        value: cssSelector,
        priority: 7,
      });
    }

    // 根据稳定性评分调整优先级
    const rankedStrategies = this.stabilityService.rankStrategies(strategies);

    return {
      strategies: rankedStrategies,
      description: `定位 ${elementInfo.tagName} 元素`,
    };
  }

  /**
   * 生成相对XPath（参考八爪鱼的相对路径定位）
   * 基于父元素、兄弟元素定位，避免使用绝对路径
   */
  private generateXPath(elementInfo: ElementInfo, parentInfo?: any, siblings?: any[]): string | null {
    // 检查 ID 是否是动态生成的
    const hasDynamicId = elementInfo.id && /el-id-\d+-\d+/.test(elementInfo.id);
    
    // 1. 优先使用 ID（如果不是动态的）
    if (elementInfo.id && !hasDynamicId) {
      return `//*[@id="${elementInfo.id}"]`;
    }

    // 2. 使用 name 属性
    if (elementInfo.name) {
      return `//${elementInfo.tagName}[@name="${elementInfo.name}"]`;
    }

    // 3. 如果有兄弟元素信息，生成基于兄弟节点的XPath
    if (siblings && siblings.length > 0) {
      const precedingSibling = siblings.find(s => s.position === 'preceding' && (s.text || s.className));
      if (precedingSibling) {
        let siblingSelector = '';
        if (precedingSibling.className) {
          siblingSelector = `${precedingSibling.tagName}[@class="${precedingSibling.className}"]`;
        } else if (precedingSibling.text) {
          const escapedText = precedingSibling.text.replace(/"/g, '\\"').replace(/'/g, "\\'");
          siblingSelector = `${precedingSibling.tagName}[text()="${escapedText}"]`;
        } else {
          siblingSelector = precedingSibling.tagName;
        }
        
        let targetSelector = '';
        if (elementInfo.className) {
          const firstClass = elementInfo.className.split(/\s+/)[0];
          targetSelector = `${elementInfo.tagName}[@class="${firstClass}"]`;
        } else if (elementInfo.text && elementInfo.text.length <= 50) {
          const escapedText = elementInfo.text.trim().replace(/"/g, '\\"').replace(/'/g, "\\'");
          targetSelector = `${elementInfo.tagName}[text()="${escapedText}"]`;
        } else {
          targetSelector = elementInfo.tagName;
        }
        
        return `//${siblingSelector}/following-sibling::${targetSelector}[1]`;
      }
    }
    
    // 4. 如果有父元素信息，生成相对XPath
    if (parentInfo) {
      const parentTag = parentInfo.tagName || '';
      const parentClass = parentInfo.className ? parentInfo.className.split(/\s+/)[0] : null;
      const parentText = parentInfo.text && parentInfo.text.length < 30 ? parentInfo.text.trim() : null;
      
      let parentSelector = '';
      if (parentClass) {
        const escapedClass = parentClass.replace(/"/g, '\\"').replace(/'/g, "\\'");
        parentSelector = `${parentTag}[@class="${escapedClass}"]`;
      } else if (parentText) {
        const escapedParentText = parentText.replace(/"/g, '\\"').replace(/'/g, "\\'");
        parentSelector = `${parentTag}[text()="${escapedParentText}"]`;
      } else {
        parentSelector = parentTag;
      }
      
      let childSelector = '';
      if (elementInfo.className) {
        const firstClass = elementInfo.className.split(/\s+/)[0];
        const escapedClass = firstClass.replace(/"/g, '\\"').replace(/'/g, "\\'");
        childSelector = `${elementInfo.tagName}[@class="${escapedClass}"]`;
      } else if (elementInfo.text && elementInfo.text.length <= 50) {
        const escapedText = elementInfo.text.trim().replace(/"/g, '\\"').replace(/'/g, "\\'");
        childSelector = `${elementInfo.tagName}[text()="${escapedText}"]`;
      } else {
        childSelector = elementInfo.tagName;
      }
      
      return `//${parentSelector}//${childSelector}`;
    }

    // 5. 对于文本，只使用短文本
    if (elementInfo.text && elementInfo.text.length <= 50 && elementInfo.text.trim().length > 0) {
      const escapedText = elementInfo.text
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");
      return `//${elementInfo.tagName}[text()="${escapedText}"]`;
    }

    return null;
  }

  /**
   * 生成CSS选择器
   */
  private generateCssSelector(elementInfo: ElementInfo, parentInfo?: any): string | null {
    const parts: string[] = [];
    
    // 如果有父元素信息，生成组合选择器
    if (parentInfo) {
      const parentClass = parentInfo.className ? parentInfo.className.split(/\s+/)[0] : null;
      if (parentClass && !/^(el-id-|hash-|random-)/.test(parentClass)) {
        parts.push(`.${parentClass}`);
      }
    }
    
    // 添加元素选择器
    if (elementInfo.className) {
      const classes = elementInfo.className.split(/\s+/);
      const stableClasses = classes.filter(cls => {
        return !/^(el-id-|hash-|random-)/.test(cls);
      });
      
      if (stableClasses.length > 0) {
        parts.push(`${elementInfo.tagName}.${stableClasses[0]}`);
      } else {
        parts.push(elementInfo.tagName);
      }
    } else {
      parts.push(elementInfo.tagName);
    }
    
    // 如果有文本，添加 :has-text() 选择器
    if (elementInfo.text && elementInfo.text.length < 30) {
      const escapedText = elementInfo.text.replace(/"/g, '\\"').replace(/'/g, "\\'");
      parts[parts.length - 1] += `:has-text("${escapedText}")`;
    }
    
    return parts.length > 0 ? parts.join(' > ') : null;
  }
}
