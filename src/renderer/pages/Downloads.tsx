import React from 'react';
import { DownloadItem } from '../../shared/types/download';
import { DownloadQueue } from '../components/DownloadQueue';

interface DownloadsProps {
  downloads: DownloadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newIndex: number) => void;
  onOpenFolder: (path: string) => void;
}

export const Downloads: React.FC<DownloadsProps> = ({
  downloads,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onReorder,
  onOpenFolder,
}) => {
  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Downloads ({downloads.length})</h1>
      </div>

      <div className="page-body">
        <DownloadQueue
          items={downloads}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
          onRetry={onRetry}
          onRemove={onRemove}
          onReorder={onReorder}
          onOpenFolder={onOpenFolder}
        />
      </div>
    </div>
  );
};
