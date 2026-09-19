export interface AppSettings {
  downloadDirectory: string;
  concurrency: number; // 1 - 5
  maxRetries: number;
  connectionTimeoutMs: number;
  retryDelayMs: number;
  theme: 'dark' | 'light' | 'system';
  filenameTemplate: string;
  autoStartQueue: boolean;
  overwriteExisting: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  downloadDirectory: '',
  concurrency: 3,
  maxRetries: 3,
  connectionTimeoutMs: 15000,
  retryDelayMs: 5000,
  theme: 'dark',
  filenameTemplate: '{title} - {episode} [{quality}].{ext}',
  autoStartQueue: true,
  overwriteExisting: false,
};

export interface TemplateContext {
  title?: string;
  episode?: string;
  quality?: string;
  ext?: string;
  filename?: string;
}
