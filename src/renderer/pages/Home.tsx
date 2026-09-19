import React from 'react';
import { UrlInput } from '../components/UrlInput';
import { DownloadCard } from '../components/DownloadCard';
import { DownloadItem, DownloadStats } from '../../shared/types/download';
import { TemplateContext } from '../../shared/types/settings';
import { Activity, Clock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { formatSpeed } from '../components/DownloadCard';

interface HomeProps {
  downloads: DownloadItem[];
  stats: DownloadStats;
  onAddUrls: (urls: string[], templateContext?: TemplateContext) => Promise<any>;
  onImportTxt: () => Promise<string[]>;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenFolder: (path: string) => void;
  onNavigateToDownloads: () => void;
}

export const Home: React.FC<HomeProps> = ({
  downloads,
  stats,
  onAddUrls,
  onImportTxt,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFolder,
  onNavigateToDownloads,
}) => {
  const recentDownloads = downloads.slice(0, 5);

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="page-body">
        {/* Queue Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '10px', borderRadius: '8px' }}>
              <Activity size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Active Downloads
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stats.activeCount}
              </div>
              {stats.totalSpeed > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--accent)' }}>
                  {formatSpeed(stats.totalSpeed)}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '10px', borderRadius: '8px' }}>
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Queued Tasks
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stats.queuedCount}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '10px', borderRadius: '8px' }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Completed
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stats.completedCount}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '10px', borderRadius: '8px' }}>
              <AlertCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Failed
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stats.failedCount}
              </div>
            </div>
          </div>
        </div>

        {/* URL Input Form */}
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            New Download
          </h2>
          <UrlInput onAddUrls={onAddUrls} onImportTxt={onImportTxt} />
        </div>

        {/* Recent Downloads */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recent Activity
            </h2>
            {downloads.length > 5 && (
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={onNavigateToDownloads}
              >
                <span>View all in Downloads</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>

          {recentDownloads.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              No downloads yet. Enter a URL above to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentDownloads.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onRemove={onRemove}
                  onOpenFolder={onOpenFolder}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
