import React, { useState, useEffect, useCallback } from 'react';
import { StorageOverview } from '../../shared/types/storage';
import {
  HardDrive,
  Folder,
  FolderInput,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Film,
  FileVideo,
  PieChart,
  ArrowRight,
} from 'lucide-react';
import { formatBytes } from '../components/DownloadCard';

interface StoragePageProps {
  onNavigateToTitle?: (titleId: string) => void;
}

export const StoragePage: React.FC<StoragePageProps> = () => {
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const loadStorage = useCallback(async () => {
    if (!window.api?.getStorageOverview) return;
    try {
      const data = await window.api.getStorageOverview();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load storage overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  const handleOpenLibraryFolder = async () => {
    if (window.api?.openLibraryFolder) {
      await window.api.openLibraryFolder();
    }
  };

  const handleDeleteWatched = async () => {
    if (!window.confirm('Delete all downloaded media files for episodes that you have already watched? (This frees up disk space while preserving your watch history)')) {
      return;
    }
    try {
      const count = await window.api.deleteWatchedEpisodes();
      setActionMessage(`Deleted ${count} watched episode media file${count === 1 ? '' : 's'}.`);
      await loadStorage();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage(`Failed to delete watched episodes: ${err.message || String(err)}`);
    }
  };

  const handleMigrateLocation = async () => {
    if (!window.api?.selectNewLibraryLocation || !window.api?.migrateLibraryLocation) return;
    try {
      const newPath = await window.api.selectNewLibraryLocation();
      if (!newPath) return;

      const moveFiles = window.confirm(
        `Move existing media files to "${newPath}"? Click OK to move files to the new location, or Cancel to leave existing files intact and only save future downloads there.`
      );

      setMigrating(true);
      setActionMessage('Migrating media files to new library location. Please wait...');
      const res = await window.api.migrateLibraryLocation(newPath, moveFiles);

      if (res.success) {
        setActionMessage(`Migration completed successfully. Moved ${res.movedCount} file(s).`);
      } else {
        setActionMessage(`Migration failed: ${res.error || 'Unknown error'}`);
      }
      await loadStorage();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setActionMessage(`Migration error: ${err.message || String(err)}`);
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={24} className="spin" color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Storage Management</h1>
          <p className="page-subtitle">
            Manage your offline video storage, disk space, and library location
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleOpenLibraryFolder} title="Open Library folder in file explorer">
            <Folder size={14} />
            <span>Open Library Folder</span>
          </button>

          <button className="btn btn-secondary" onClick={handleMigrateLocation} disabled={migrating} title="Move library to another hard drive or folder">
            <FolderInput size={14} />
            <span>Change Location...</span>
          </button>

          <button className="btn btn-danger" onClick={handleDeleteWatched} title="Delete downloaded video files of completed episodes to free disk space">
            <Trash2 size={14} />
            <span>Clean Watched Episodes</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '6px',
            color: '#93c5fd',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          {actionMessage}
        </div>
      )}

      <div className="page-body">
        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '12px', borderRadius: '8px' }}>
              <HardDrive size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Library Size
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatBytes(overview?.totalLibrarySizeBytes || 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {overview?.totalMediaFiles || 0} local media files
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '12px', borderRadius: '8px' }}>
              <PieChart size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Disk Free Space
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {overview?.availableDiskSpaceBytes ? formatBytes(overview.availableDiskSpaceBytes) : 'Available'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={overview?.libraryPath}>
                {overview?.libraryPath}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '12px', borderRadius: '8px' }}>
              <Film size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Catalog
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {overview?.totalTitles || 0} Titles
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {overview?.totalSeasons || 0} Seasons • {overview?.totalEpisodes || 0} Episodes
              </div>
            </div>
          </div>
        </div>

        {/* Per-Title Storage Breakdown */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Storage by Anime Title
          </h3>

          {overview?.titleBreakdowns.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              No downloaded media in the library yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {overview?.titleBreakdowns.map((title) => {
                const totalLib = overview.totalLibrarySizeBytes || 1;
                const percentage = Math.round((title.totalBytes / totalLib) * 100);

                return (
                  <div key={title.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {title.titleName}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {formatBytes(title.totalBytes)} ({percentage}%) • {title.downloadedCount} episodes
                      </span>
                    </div>

                    <div className="progress-container" style={{ height: '5px' }}>
                      <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Largest Files Table */}
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
            Largest Video Files
          </h3>

          {overview?.largestFiles.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              No media files recorded.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overview?.largestFiles.map((f) => (
                <div
                  key={f.id}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileVideo size={16} color="#38bdf8" />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {f.titleName} — S{String(f.seasonNumber).padStart(2, '0')}E{String(f.episodeNumber).padStart(2, '0')}
                        {f.episodeName ? ` (${f.episodeName})` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {f.fileName} {f.resolution ? `• ${f.resolution}` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                      {formatBytes(f.fileSizeBytes)}
                    </span>
                    <button
                      className="btn-icon"
                      onClick={() => window.api?.openFolder(f.filePath)}
                      title="Reveal in file explorer"
                    >
                      <Folder size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
