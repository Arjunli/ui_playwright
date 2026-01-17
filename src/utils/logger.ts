import { allure } from 'allure-playwright';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * 日志工具
 */
export class Logger {
  private static instance: Logger;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 记录日志
   */
  log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    if (data) {
      console.log('数据:', data);
    }

    // 添加到 Allure
    if (level === LogLevel.ERROR) {
      allure.attachment('错误日志', logMessage, 'text/plain');
    }
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * 信息日志
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | any): void {
    this.log(LogLevel.ERROR, message, error);
    if (error instanceof Error) {
      allure.attachment('错误堆栈', error.stack || '', 'text/plain');
    }
  }

  /**
   * Allure 步骤日志
   */
  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return await allure.step(name, fn);
  }
}

// 导出单例实例
export const logger = Logger.getInstance();
