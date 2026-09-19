import React, { useState, useEffect } from 'react';
import { ExportJob, ExportStatus } from '../../shared/types/export';
import {
  Share2,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  Film,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { formatBytes, formatSpeed } from '../components/DownloadCard';

interface ExportPageProps {
  onNavigateToLibrary: () => void;
}

export const ExportPage: React.FC<ExportPageProps> = ({ onNavigateToLibrary }) => {
  const [jobs, setJobs] = useState<ExportJob[]>([]);

  useEffect(() => {
    let active = true;
    async function loadJobs() {
      if (!window.api?.getExportJobs) return;
      try {
        const list = await window.api.getExportJobs();
        if (active) setJobs(list);
      } catch (err) {
        console.error('Failed to load export jobs:', err);
      }
    }
    loadJobs();

    // Listen for progress updates
    const unsubProgress = window.api?.onExportProgress?.((job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = job;
          return updated;
        }
        return [job, ...prev];
      });
    });

    const unsubStatus = window.api?.onExportStatusChange?.((job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = job;
          return updated;
        }
        return [job, ...prev];
      });
    });

    return () => {
      active = false;
      unsubProgress?.();
      unsubStatus?.();
    };
  }, []);

  const handleCancel = async (jobId: string) => {
    if (window.api?.cancelExport) {
      await window.api.cancelExport(jobId);
    }
  };

  const handleOpenFolder = async (folderPath: string) => {
    if (window.api?.openExportFolder) {
      await window.api.openExportFolder(folderPath);
    }
  };

  const getStatusBadge = (status: ExportStatus) => {
    switch (status) {
      case 'Completed':
        return <span className="badge badge-completed">Completed</span>;
      case 'Copying':
        return <span className="badge badge-downloading">Exporting</span>;
      case 'Cancelled':
        return <span className="badge badge-cancelled">Cancelled</span>;
      case 'Failed':
        return <span className="badge badge-failed">Failed</span>;
      default:
        return <span className="badge badge-queued">Queued</span>;
    }
  };

  return (
    <div className="main-content">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Export Center</h1>
          <p className="page-subtitle">
            Transfer videos to mobile phones, tablets, USB drives, or SD cards
          </p>
        </div>
      </div>

      <div className="page-body">
        {jobs.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              maxWidth: '520px',
              margin: '40px auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <Smartphone size={28} />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              No Active or Recent Exports
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              You can export episodes, full seasons, or complete titles into standard playable MP4/MKV video files.
              Connect your phone, tablet, or USB flash drive, then open any title in your library and click <strong>Export</strong>.
            </p>

            <button className="btn btn-primary" onClick={onNavigateToLibrary} style={{ marginTop: '8px' }}>
              <Film size={14} />
              <span>Go to Media Library</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  backgroundColor: 'var(--bg-card)',
                  borderColor: job.status === 'Copying' ? 'var(--accent)' : 'var(--border-color)',
                }}
              >
                {/* Job Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                      }}
                    >
                      <Share2 size={18} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                          Export to: {job.destinationDir}
                        </h3>
                        {getStatusBadge(job.status)}
                      </div>

                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {job.items.length} file{job.items.length === 1 ? '' : 's'} • {formatBytes(job.copiedBytes)} / {formatBytes(job.totalBytes)} ({job.overallPercentage}%)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleOpenFolder(job.destinationDir)}
                      title="Open export destination folder in system file explorer"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <FolderOpen size={14} />
                      <span>Open Folder</span>
                    </button>

                    {job.status === 'Copying' && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleCancel(job.id)}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        <XCircle size={14} />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Overall Progress Bar */}
                <div className="progress-container" style={{ height: '7px' }}>
                  <div
                    className={`progress-bar-fill ${job.status === 'Completed' ? 'completed' : job.status === 'Failed' ? 'failed' : ''}`}
                    style={{ width: `${job.overallPercentage}%` }}
                  />
                </div>

                {/* Individual File Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {job.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.titleName} — S{String(item.seasonNumber).padStart(2, '0')}E{String(item.episodeNumber).padStart(2, '0')}
                          </span>
                          {item.episodeName && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              ({item.episodeName})
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                          {item.speed > 0 && (
                            <span style={{ color: 'var(--accent)' }}>
                              {formatSpeed(item.speed)}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {formatBytes(item.copiedBytes)} / {formatBytes(item.fileSizeBytes)}
                          </span>
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {item.status === 'Copying' && (
                        <div className="progress-container" style={{ height: '4px' }}>
                          <div className="progress-bar-fill" style={{ width: `${item.percentage}%` }} />
                        </div>
                      )}

                      {item.error && (
                        <div style={{ fontSize: '11px', color: '#f87171' }}>
                          Error: {item.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
