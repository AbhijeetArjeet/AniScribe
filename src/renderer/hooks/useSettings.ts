import { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types/settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (window.api) {
      window.api.getSettings().then((loaded) => {
        if (mounted) {
          setSettings(loaded);
          setLoading(false);
        }
      }).catch((err) => {
        console.error('Failed to load settings:', err);
        if (mounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!window.api) return;
    const updated = await window.api.updateSettings(partial);
    setSettings(updated);
    return updated;
  }, []);

  const selectDirectory = useCallback(async () => {
    if (!window.api) return null;
    const dir = await window.api.selectDirectory();
    if (dir) {
      await updateSettings({ downloadDirectory: dir });
    }
    return dir;
  }, [updateSettings]);

  return {
    settings,
    loading,
    updateSettings,
    selectDirectory,
  };
}
