import React, { useState, useEffect } from 'react';
import { DriveInfo, CollisionResolution, ExportRequestPayload } from '../../shared/types/export';
import {
  Smartphone,
  Folder,
  HardDrive,
  CheckCircle,
  AlertCircle,
  X,
  Share2,
  HelpCircle,
} from 'lucide-react';
import { formatBytes } from './DownloadCard';

interface ExportModalProps {
  mediaFileIds: string[];
  totalBytes?: number;
  itemCount: number;
  titleName?: string;
  onClose: () => void;
  onExportStarted: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  mediaFileIds,
  totalBytes,
  itemCount,
  titleName,
  onClose,
  onExportStarted,
}) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDir, setSelectedDir] = useState<string>('');
  const [createMobileFolders, setCreateMobileFolders] = useState<boolean>(true);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
  const [collisionResolution, setCollisionResolution] = useState<CollisionResolution>('rename');
  const [isMove, setIsMove] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDrives() {
      if (!window.api?.getAvailableDrives) return;
      try {
        const available = await window.api.getAvailableDrives();
        setDrives(available);
        // If a removable drive is available, select it by default, otherwise pick first
        const removable = available.find((d) => d.isRemovable);
        if (removable) {
          setSelectedDir(removable.mount);
        } else if (available.length > 0) {
          setSelectedDir(available[0].mount);
        }
      } catch (err) {
        console.warn('Failed to detect drives:', err);
      }
    }
    loadDrives();
  }, []);

  const handleBrowseFolder = async () => {
    if (!window.api?.selectExportFolder) return;
    try {
      const folder = await window.api.selectExportFolder();
      if (folder) {
        setSelectedDir(folder);
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  };

  const handleStartExport = async () => {
    if (!selectedDir) {
      setError('Please choose an export destination folder.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: ExportRequestPayload = {
        mediaFileIds,
        destinationDir: selectedDir,
        createMobileFolders,
        collisionResolution,
        isMove,
        includeSubtitles,
      };

      await window.api.exportMedia(payload);
      onExportStarted();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start export.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="card"
        style={{
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          padding: '24px',
          backgroundColor: '#111827',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <Smartphone size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Export for Mobile / Tablet / USB
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                {titleName ? `${titleName} — ` : ''}{itemCount} video{itemCount === 1 ? '' : 's'}
                {totalBytes ? ` (${formatBytes(totalBytes)})` : ''}
              </p>
            </div>
          </div>

          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Informative explanation banner */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <HelpCircle size={16} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
          <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
            Export creates normal, playable video files (MP4/MKV) that you can transfer directly to your phone,
            tablet, USB flash drive, or SD card. No special app or internet connection is required on your mobile device.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: '#f87171',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {/* Destination Section */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Export Destination:
          </label>

          {/* Quick drive selections if any */}
          {drives.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {drives.map((drive) => (
                <button
                  key={drive.mount}
                  type="button"
                  onClick={() => setSelectedDir(drive.mount)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    border: '1px solid',
                    backgroundColor: selectedDir === drive.mount ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    borderColor: selectedDir === drive.mount ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                    color: selectedDir === drive.mount ? '#60a5fa' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <HardDrive size={13} color={drive.isRemovable ? '#34d399' : 'currentColor'} />
                  <span>{drive.label}</span>
                  {drive.freeBytes && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      ({formatBytes(drive.freeBytes)} free)
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Selected Path Input + Browse Button */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input"
              value={selectedDir}
              onChange={(e) => setSelectedDir(e.target.value)}
              placeholder="e.g. E:\ or C:\Users\hp\Desktop\Export"
              style={{ flex: 1, fontSize: '12px' }}
            />
            <button className="btn btn-secondary" onClick={handleBrowseFolder} type="button">
              <Folder size={14} />
              <span>Browse...</span>
            </button>
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {/* Mobile Folder Structure */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}>
            <input
              type="checkbox"
              checked={createMobileFolders}
              onChange={(e) => setCreateMobileFolders(e.target.checked)}
              style={{ accentColor: '#3b82f6' }}
            />
            <span>Create structured mobile folders (<code style={{ fontSize: '11px', color: '#93c5fd' }}>Title/Season 01/...</code>)</span>
          </label>

          {/* Include Subtitles for Mobile */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}>
            <input
              type="checkbox"
              checked={includeSubtitles}
              onChange={(e) => setIncludeSubtitles(e.target.checked)}
              style={{ accentColor: '#38bdf8' }}
            />
            <span>Include Subtitles (<code style={{ fontSize: '11px', color: '#38bdf8' }}>.en.srt</code> alongside video for VLC / MX Player)</span>
          </label>

          {/* Collision handling */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>If file already exists at destination:</span>
            <select
              className="select"
              value={collisionResolution}
              onChange={(e) => setCollisionResolution(e.target.value as CollisionResolution)}
              style={{ width: '180px', padding: '4px 8px', fontSize: '12px' }}
            >
              <option value="rename">Rename automatically (1)</option>
              <option value="replace">Replace existing file</option>
              <option value="skip">Skip if exists</option>
            </select>
          </div>

          {/* Safe copy vs move */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={isMove}
              onChange={(e) => setIsMove(e.target.checked)}
              style={{ accentColor: '#ef4444' }}
            />
            <span>Move files instead of Copy (Removes original from PC library after export)</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'auto' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleStartExport} disabled={loading || !selectedDir}>
            <Share2 size={14} />
            <span>{loading ? 'Starting Export...' : 'Export Videos Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
