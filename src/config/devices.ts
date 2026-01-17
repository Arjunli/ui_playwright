import { devices as playwrightDevices, Device } from '@playwright/test';

export interface CustomDevice extends Device {
  name: string;
  description?: string;
}

export const customDevices: Record<string, CustomDevice> = {
  'iPhone 13 Pro': {
    ...playwrightDevices['iPhone 13 Pro'],
    name: 'iPhone 13 Pro',
    description: 'Apple iPhone 13 Pro',
  },
  'iPhone 13': {
    ...playwrightDevices['iPhone 13'],
    name: 'iPhone 13',
    description: 'Apple iPhone 13',
  },
  'iPhone SE': {
    ...playwrightDevices['iPhone SE'],
    name: 'iPhone SE',
    description: 'Apple iPhone SE',
  },
  'Pixel 5': {
    ...playwrightDevices['Pixel 5'],
    name: 'Pixel 5',
    description: 'Google Pixel 5',
  },
  'Pixel 4': {
    ...playwrightDevices['Pixel 4'],
    name: 'Pixel 4',
    description: 'Google Pixel 4',
  },
  'Galaxy S21': {
    ...playwrightDevices['Galaxy S21'],
    name: 'Galaxy S21',
    description: 'Samsung Galaxy S21',
  },
  'iPad Pro': {
    ...playwrightDevices['iPad Pro'],
    name: 'iPad Pro',
    description: 'Apple iPad Pro',
  },
  'iPad Air': {
    ...playwrightDevices['iPad Air'],
    name: 'iPad Air',
    description: 'Apple iPad Air',
  },
};

export function getDevice(name: string): CustomDevice | undefined {
  return customDevices[name] || playwrightDevices[name];
}

export function getAllDevices(): CustomDevice[] {
  return Object.values(customDevices);
}

export function getDevicesByType(type: 'mobile' | 'tablet' | 'desktop'): CustomDevice[] {
  const devices = getAllDevices();
  return devices.filter(device => {
    if (type === 'mobile') {
      return device.isMobile && !device.isTablet;
    }
    if (type === 'tablet') {
      return device.isTablet;
    }
    return !device.isMobile && !device.isTablet;
  });
}

export default customDevices;
