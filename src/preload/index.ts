import { contextBridge, ipcRenderer } from 'electron';
import type { SalarySettings } from '../shared/salary';

contextBridge.exposeInMainWorld('salaryClock', {
  loadSettings: (): Promise<SalarySettings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: SalarySettings): Promise<{ settings: SalarySettings; widgetPublished: boolean; widgetError?: string }> =>
    ipcRenderer.invoke('settings:save', settings),
});
