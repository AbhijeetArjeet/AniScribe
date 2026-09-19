import { useState, useEffect, useCallback, useMemo } from 'react';
import { DownloadItem, DownloadProgress, DownloadStatus } from '../../shared/types/download';
import { TemplateContext } from '../../shared/types/settings';

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    let mounted = true;
    if (window.api) {
      window.api.getAllDownloads().then((items) => {
        if (mounted) {
          setDownloads(items);
          setLoading(false);
        }
      }).catch((err) => {
        console.error('Failed to load downloads:', err);
        if (mounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Listen to IPC events
  useEffect(() => {
    if (!window.api) return;

    const unsubProgress = window.api.onProgress((progress: DownloadProgress) => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.id === progress.id) {
            return {
              ...item,
              downloadedBytes: progress.downloadedBytes,
              totalSize: progress.totalSize,
              percentage: progress.percentage,
              speed: progress.speed,
              eta: progress.eta,
              rangeSupported: progress.rangeSupported,
            };
          }
          return item;
        })
      );
    });

    const unsubStatus = window.api.onStatusChange((data) => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.id === data.id) {
            return {
              ...item,
              status: data.status,
              error: data.error,
              waitingReason: data.waiting?.reason,
              retryAt: data.waiting?.retryAt,
              speed: data.status === 'Downloading' ? item.speed : 0,
              eta: data.status === 'Downloading' ? item.eta : 0,
            };
          }
          return item;
        })
      );
    });

    const unsubQueue = window.api.onQueueUpdated((items: DownloadItem[]) => {
      setDownloads(items);
    });

    return () => {
      unsubProgress();
      unsubStatus();
      unsubQueue();
    };
  }, []);

  const addDownloads = useCallback(async (urls: string[], templateContext?: TemplateContext) => {
    if (!window.api) return [];
    return await window.api.addDownloads({ urls, templateContext });
  }, []);

  const pauseDownload = useCallback(async (id: string) => {
    if (!window.api) return;
    await window.api.pauseDownload(id);
  }, []);

  const resumeDownload = useCallback(async (id: string) => {
    if (!window.api) return;
    await window.api.resumeDownload(id);
  }, []);

  const cancelDownload = useCallback(async (id: string) => {
    if (!window.api) return;
    await window.api.cancelDownload(id);
  }, []);

  const retryDownload = useCallback(async (id: string) => {
    if (!window.api) return;
    await window.api.retryDownload(id);
  }, []);

  const removeDownload = useCallback(async (id: string) => {
    if (!window.api) return;
    await window.api.removeDownload(id);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const reorderDownload = useCallback(async (id: string, newIndex: number) => {
    if (!window.api) return;
    await window.api.reorderDownload(id, newIndex);
  }, []);

  const openFolder = useCallback(async (filePath: string) => {
    if (!window.api) return;
    await window.api.openFolder(filePath);
  }, []);

  const importTxt = useCallback(async () => {
    if (!window.api) return [];
    return await window.api.importTxt();
  }, []);

  const stats = useMemo(() => {
    let activeCount = 0;
    let queuedCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalSpeed = 0;

    for (const item of downloads) {
      if (item.status === 'Downloading' || item.status === 'Waiting') {
        activeCount++;
        totalSpeed += item.speed;
      } else if (item.status === 'Queued') {
        queuedCount++;
      } else if (item.status === 'Completed') {
        completedCount++;
      } else if (item.status === 'Failed') {
        failedCount++;
      }
    }

    return {
      activeCount,
      queuedCount,
      completedCount,
      failedCount,
      totalSpeed,
    };
  }, [downloads]);

  return {
    downloads,
    loading,
    stats,
    addDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    reorderDownload,
    openFolder,
    importTxt,
  };
}
