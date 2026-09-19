import React from 'react';
import { DownloadItem } from '../../shared/types/download';
import { ProgressBar } from './ProgressBar';
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Folder,
  AlertTriangle,
  Globe,
  Trash2,
  Clock,
} from 'lucide-react';

interface DownloadCardProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenFolder: (path: string) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

export const DownloadCard: React.FC<DownloadCardProps> = ({
  item,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFolder,
}) => {
  const isDownloading = item.status === 'Downloading';
  const isPaused = item.status === 'Paused';
  const isWaiting = item.status === 'Waiting';
  const isCompleted = item.status === 'Completed';
  const isFailed = item.status === 'Failed';
  const isCancelled = item.status === 'Cancelled';
  const isQueued = item.status === 'Queued';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={item.filename}
          >
            {item.filename}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', color: 'var(--text-muted)', fontSize: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={12} />
              <span>{item.hostname}</span>
            </div>
            <span>•</span>
            <span>{formatBytes(item.downloadedBytes)} / {item.totalSize > 0 ? formatBytes(item.totalSize) : 'Unknown'}</span>
            {item.rangeSupported && (
              <>
                <span>•</span>
                <span style={{ color: '#34d399' }}>Range Supported</span>
              </>
            )}
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`badge badge-${item.status.toLowerCase()}`}>
            {item.status}
          </span>

          <div style={{ display: 'flex', gap: '4px' }}>
            {isDownloading && (
              <button className="btn-icon" onClick={() => onPause(item.id)} title="Pause">
                <Pause size={15} />
              </button>
            )}

            {(isPaused || isQueued) && (
              <button className="btn-icon" onClick={() => onResume(item.id)} title="Resume">
                <Play size={15} />
              </button>
            )}

            {(isFailed || isCancelled) && (
              <button className="btn-icon" onClick={() => onRetry(item.id)} title="Retry">
                <RotateCcw size={15} />
              </button>
            )}

            {(isDownloading || isWaiting || isQueued) && (
              <button className="btn-icon" onClick={() => onCancel(item.id)} title="Cancel">
                <X size={15} />
              </button>
            )}

            {isCompleted && (
              <button
                className="btn-icon"
                onClick={() => onOpenFolder(`${item.destination}/${item.filename}`)}
                title="Open Folder"
              >
                <Folder size={15} />
              </button>
            )}

            <button className="btn-icon" onClick={() => onRemove(item.id)} title="Remove from list">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBar percentage={item.percentage} status={item.status} />

      {/* Stats Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <div>
          {item.percentage > 0 ? `${item.percentage.toFixed(1)}%` : '0%'}
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          {isDownloading && (
            <>
              <span>Speed: <strong style={{ color: 'var(--text-primary)' }}>{formatSpeed(item.speed)}</strong></span>
              <span>ETA: <strong style={{ color: 'var(--text-primary)' }}>{formatEta(item.eta)}</strong></span>
            </>
          )}
        </div>
      </div>

      {/* Waiting Countdown Banner */}
      {isWaiting && (
        <div className="waiting-banner">
          <Clock size={16} />
          <div>
            <div style={{ fontWeight: 600 }}>Server requested a retry</div>
            <div>{item.waitingReason || 'Waiting for rate-limit cooldown...'}</div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {isFailed && item.error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '12px' }}>
          <AlertTriangle size={14} />
          <span>{item.error}</span>
        </div>
      )}
    </div>
  );
};
