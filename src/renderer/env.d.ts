/// <reference types="vite/client" />

import type { SalarySettings } from '../shared/salary';

declare global {
  interface Window {
    salaryClock?: {
      loadSettings(): Promise<SalarySettings>;
      saveSettings(settings: SalarySettings): Promise<{ settings: SalarySettings; widgetPublished: boolean; widgetError?: string }>;
    };
  }
}

export {};
