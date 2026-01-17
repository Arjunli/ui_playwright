import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env') });

export type Environment = 'dev' | 'staging' | 'prod';

export interface EnvironmentConfig {
  name: Environment;
  webUrl: string;
  mobileUrl: string;
  apiUrl?: string;
  credentials?: {
    username: string;
    password: string;
  };
  timeout?: number;
}

const environments: Record<Environment, EnvironmentConfig> = {
  dev: {
    name: 'dev',
    webUrl: process.env.WEB_DEV_URL || 'http://localhost:3000',
    mobileUrl: process.env.MOBILE_DEV_URL || 'http://localhost:3000',
    apiUrl: process.env.API_DEV_URL,
    credentials: {
      username: process.env.TEST_USERNAME || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'password123',
    },
    timeout: 30000,
  },
  staging: {
    name: 'staging',
    webUrl: process.env.WEB_STAGING_URL || 'https://staging.example.com',
    mobileUrl: process.env.MOBILE_STAGING_URL || 'https://m.staging.example.com',
    apiUrl: process.env.API_STAGING_URL,
    credentials: {
      username: process.env.TEST_USERNAME || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'password123',
    },
    timeout: 30000,
  },
  prod: {
    name: 'prod',
    webUrl: process.env.WEB_PROD_URL || 'https://prod.example.com',
    mobileUrl: process.env.MOBILE_PROD_URL || 'https://m.prod.example.com',
    apiUrl: process.env.API_PROD_URL,
    credentials: {
      username: process.env.TEST_USERNAME || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'password123',
    },
    timeout: 30000,
  },
};

export function getEnvironment(env?: string): EnvironmentConfig {
  const envName = (env || process.env.ENV || 'dev').toLowerCase() as Environment;
  return environments[envName] || environments.dev;
}

export function getAllEnvironments(): EnvironmentConfig[] {
  return Object.values(environments);
}

export default environments;
