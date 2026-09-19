import React, { useState } from 'react';
import { LibraryTitle, LibraryFilter } from '../../shared/types/library';
import {
  Film,
  Search,
  RefreshCw,
  Play,
  CheckCircle,
  FolderSync,
  Tv,
  Clock,
  Sparkles,
} from 'lucide-react';

interface LibraryProps {
  titles: LibraryTitle[];
  loading: boolean;
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  search: string;
  onSearchChange: (query: string) => void;
  onSelectTitle: (title: LibraryTitle) => void;
  onScanLibrary: () => Promise<number>;
  onNavigateHome: () => void;
}

export const Library: React.FC<LibraryProps> = ({
  titles,
  loading,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onSelectTitle,
  onScanLibrary,
  onNavigateHome,
}) => {
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const added = await onScanLibrary();
      setScanMessage(`Scan finished: ${added} new file${added === 1 ? '' : 's'} indexed.`);
      setTimeout(() => setScanMessage(null), 4000);
    } catch (err: any) {
      setScanMessage(`Scan failed: ${err.message || String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const filterTabs: { key: LibraryFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All Titles', icon: <Film size={14} /> },
    { key: 'continue_watching', label: 'Continue Watching', icon: <Play size={14} /> },
    { key: 'recently_added', label: 'Recently Added', icon: <Clock size={14} /> },
    { key: 'completed', label: 'Completed', icon: <CheckCircle size={14} /> },
  ];

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Media Library</h1>
          <p className="page-subtitle">
            Offline media library for your authorized video downloads
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleScan}
            disabled={scanning}
            title="Scan library folder on disk for newly placed video files"
          >
            <FolderSync size={15} className={scanning ? 'spin' : ''} />
            <span>{scanning ? 'Scanning...' : 'Scan Local Files'}</span>
          </button>
        </div>
      </div>

      {scanMessage && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#93c5fd',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {scanMessage}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid',
                backgroundColor: filter === tab.key ? 'var(--accent)' : 'var(--bg-card)',
                borderColor: filter === tab.key ? 'var(--accent)' : 'var(--border-color)',
                color: filter === tab.key ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search library..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Grid of Titles */}
      <div className="page-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading your offline library...</p>
          </div>
        ) : titles.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              maxWidth: '500px',
              margin: '40px auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Film size={44} color="#64748b" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {search ? 'No Matching Titles Found' : 'Your Library is Empty'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {search
                ? `No titles match "${search}". Try clearing your search filter.`
                : 'Downloaded episodes from authorized sources will be automatically organized here for offline playback.'}
            </p>
            {search ? (
              <button className="btn btn-secondary" onClick={() => onSearchChange('')}>
                Clear Search
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn btn-primary" onClick={onNavigateHome}>
                  <Sparkles size={14} />
                  <span>Explore & Download</span>
                </button>
                <button className="btn btn-secondary" onClick={handleScan}>
                  <FolderSync size={14} />
                  <span>Scan Local Disk</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '20px',
            }}
          >
            {titles.map((title) => {
              const isCompleted =
                title.totalEpisodes > 0 &&
                title.downloadedEpisodes >= title.totalEpisodes;

              return (
                <div
                  key={title.id}
                  onClick={() => onSelectTitle(title)}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Poster / Thumbnail */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '2 / 3',
                      backgroundColor: '#0f172a',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {title.posterPath ? (
                      <img
                        src={title.posterPath}
                        alt={title.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Tv size={36} color="#334155" />
                    )}

                    {/* Badge top-right */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                      }}
                    >
                      {isCompleted ? (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.9)',
                            color: '#fff',
                            fontSize: '10px',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          Complete
                        </span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.85)',
                            color: '#94a3b8',
                            fontSize: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          {title.downloadedEpisodes} / {title.totalEpisodes}
                        </span>
                      )}
                    </div>

                    {/* Continue watching overlay banner */}
                    {title.continueWatchingEpisode && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: '6px 8px',
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#60a5fa',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        <Play size={12} fill="#60a5fa" />
                        <span>Resume Ep {title.continueWatchingEpisode.episodeNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Title Info */}
                  <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          margin: 0,
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                        title={title.name}
                      >
                        {title.name}
                      </h4>
                      {title.originalName && (
                        <p
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            margin: '3px 0 0 0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {title.originalName}
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>
                        {title.seasons.length} {title.seasons.length === 1 ? 'Season' : 'Seasons'}
                      </span>
                      <span style={{ color: '#38bdf8' }}>
                        {title.downloadedEpisodes} DL
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
