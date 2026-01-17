import type { ElementInfo } from '../recorder/locator-generator';

/**
 * 元素指纹服务（参考八爪鱼的元素指纹识别）
 * 结合多个属性生成唯一标识，评估稳定性
 */
export class ElementFingerprintService {
  /**
   * 计算元素指纹
   * 结合多个属性生成唯一标识：tagName + id + className + text + position
   */
  calculateFingerprint(elementInfo: ElementInfo): {
    fingerprint: string;
    stability: number;
    attributes: string[];
  } {
    const attributes: string[] = [];
    let stability = 0;
    
    // 1. testid（最稳定，+10分）
    if (elementInfo.testId) {
      attributes.push(`data-testid="${elementInfo.testId}"`);
      stability += 10;
    }
    
    // 2. id（如果不是动态的，+8分）
    if (elementInfo.id && !/el-id-\d+-\d+/.test(elementInfo.id)) {
      attributes.push(`id="${elementInfo.id}"`);
      stability += 8;
    }
    
    // 3. name（+7分）
    if (elementInfo.name) {
      attributes.push(`name="${elementInfo.name}"`);
      stability += 7;
    }
    
    // 4. placeholder（+6分）
    if (elementInfo.placeholder) {
      attributes.push(`placeholder="${elementInfo.placeholder}"`);
      stability += 6;
    }
    
    // 5. role（+5分）
    if (elementInfo.role) {
      attributes.push(`role="${elementInfo.role}"`);
      stability += 5;
    }
    
    // 6. className（+4分，但需要检查是否是动态类名）
    if (elementInfo.className) {
      const classes = elementInfo.className.split(/\s+/);
      const stableClasses = classes.filter(cls => {
        // 过滤掉动态类名（如 el-id-xxx, hash-xxx 等）
        return !/^(el-id-|hash-|random-)/.test(cls);
      });
      
      if (stableClasses.length > 0) {
        attributes.push(`class="${stableClasses[0]}"`);
        stability += 4;
      }
    }
    
    // 7. text（+3分，但文本可能变化）
    if (elementInfo.text && elementInfo.text.length > 0 && elementInfo.text.length < 50) {
      attributes.push(`text="${elementInfo.text.substring(0, 30)}"`);
      stability += 3;
    }
    
    // 8. tagName（+1分，最不稳定）
    if (elementInfo.tagName) {
      attributes.push(`tag="${elementInfo.tagName}"`);
      stability += 1;
    }
    
    // 生成指纹字符串（按稳定性排序）
    const fingerprint = attributes.join(' | ');
    
    return {
      fingerprint,
      stability,
      attributes
    };
  }

  /**
   * 评估属性稳定性
   * 返回稳定性分数（0-10）
   */
  evaluateAttributeStability(attribute: string, value: string): number {
    // testid 最稳定
    if (attribute === 'data-testid') return 10;
    
    // 静态 id
    if (attribute === 'id' && !/el-id-\d+-\d+/.test(value)) return 8;
    
    // name 和 placeholder
    if (attribute === 'name' || attribute === 'placeholder') return 7;
    
    // role
    if (attribute === 'role') return 5;
    
    // className（需要检查是否是动态的）
    if (attribute === 'class') {
      if (/^(el-id-|hash-|random-)/.test(value)) return 0; // 动态类名不稳定
      return 4;
    }
    
    // text（可能变化）
    if (attribute === 'text') return 3;
    
    // tagName（最不稳定）
    if (attribute === 'tag') return 1;
    
    return 0;
  }

  /**
   * 生成元素签名
   * 即使部分属性变化也能识别
   */
  generateSignature(elementInfo: ElementInfo): string {
    const parts: string[] = [];
    
    // 优先使用稳定属性
    if (elementInfo.testId) {
      parts.push(`testid:${elementInfo.testId}`);
    }
    
    if (elementInfo.id && !/el-id-\d+-\d+/.test(elementInfo.id)) {
      parts.push(`id:${elementInfo.id}`);
    }
    
    if (elementInfo.name) {
      parts.push(`name:${elementInfo.name}`);
    }
    
    if (elementInfo.role) {
      parts.push(`role:${elementInfo.role}`);
    }
    
    // 如果稳定属性不足，添加部分文本
    if (parts.length < 2 && elementInfo.text) {
      const shortText = elementInfo.text.substring(0, 20);
      parts.push(`text:${shortText}`);
    }
    
    return parts.join('|');
  }
}
