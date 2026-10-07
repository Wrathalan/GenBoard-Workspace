export type AppUpdateState = {
  phase: 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing';
  version?: string;
  percent?: number;
  message?: string;
};

export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
