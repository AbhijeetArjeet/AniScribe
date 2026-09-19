import React, { useState } from 'react';
import { LibraryTitle, LibraryEpisode } from '../../shared/types/library';
import { SeasonDownloadModal } from '../components/SeasonDownloadModal';
import { ExportModal } from '../components/ExportModal';
import {
  Play,
  ArrowLeft,
  Download,
  CheckCircle,
  Clock,
  Circle,
  Trash2,
  Tv,
  Film,
  Smartphone,
  Share2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { formatBytes } from '../components/DownloadCard';

interface TitleDetailProps {
  title: LibraryTitle;
  onBack: () => void;
  onPlayEpisode: (episode: LibraryEpisode) => void;
  onRefresh: () => void;
}

export const TitleDetail: React.FC<TitleDetailProps> = ({
  title,
  onBack,
  onPlayEpisode,
  onRefresh,
}) => {
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [exportModalPayload, setExportModalPayload] = useState<{
    mediaFileIds: string[];
    totalBytes?: number;
    itemCount: number;
    titleName?: string;
  } | null>(null);

  const activeSeason = title.seasons[activeSeasonIdx] || title.seasons[0];

  const handleDeleteTitle = async () => {
    if (window.confirm(`Are you sure you want to remove "${title.name}" from your library?`)) {
      const deleteDiskFiles = window.confirm('Do you also want to delete the downloaded video files from disk?');
      await window.api.deleteLibraryTitle(title.id, deleteDiskFiles);
      onBack();
    }
  };

  const handleDeleteMedia = async (mediaFileId: string, epName: string) => {
    if (window.confirm(`Delete downloaded file for ${epName}?`)) {
      await window.api.deleteMediaFile(mediaFileId, true);
      onRefresh();
    }
  };

  const downloadedInActiveSeason = activeSeason
    ? activeSeason.episodes.filter((e) => e.isDownloaded && e.mediaFile)
    : [];

  const handleExportTitle = () => {
    const ids: string[] = [];
    let bytes = 0;
    for (const s of title.seasons) {
      for (const ep of s.episodes) {
        if (ep.mediaFile) {
          ids.push(ep.mediaFile.id);
          bytes += ep.mediaFile.fileSize;
        }
      }
    }
    if (ids.length === 0) return;
    setExportModalPayload({
      mediaFileIds: ids,
      totalBytes: bytes,
      itemCount: ids.length,
      titleName: title.name,
    });
  };

  const handleExportSeason = () => {
    if (downloadedInActiveSeason.length === 0) return;
    const ids = downloadedInActiveSeason.map((e) => e.mediaFile!.id);
    const bytes = downloadedInActiveSeason.reduce((acc, e) => acc + (e.mediaFile?.fileSize || 0), 0);
    setExportModalPayload({
      mediaFileIds: ids,
      totalBytes: bytes,
      itemCount: ids.length,
      titleName: `${title.name} (${activeSeason.name})`,
    });
  };

  const [isBatchSubtitling, setIsBatchSubtitling] = useState(false);
  const [batchSubMessage, setBatchSubMessage] = useState<string | null>(null);

  const handleBatchSeasonSubtitles = async () => {
    if (!window.api || downloadedInActiveSeason.length === 0) return;
    setIsBatchSubtitling(true);
    setBatchSubMessage('Queuing AI Subtitle generation for season...');
    try {
      await window.api.batchGenerateSeasonSubtitles(title.id, activeSeason.seasonNumber);
      setBatchSubMessage(`Queued ${downloadedInActiveSeason.length} episodes for Japanese→English subtitles.`);
      setTimeout(() => setBatchSubMessage(null), 4000);
    } catch (err) {
      setBatchSubMessage('Failed to queue batch subtitles.');
    } finally {
      setIsBatchSubtitling(false);
    }
  };

  return (
    <div className="main-content">
      {/* Top Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ padding: '6px 12px', fontSize: '12px' }}>
          <ArrowLeft size={14} />
          <span>Back to Library</span>
        </button>
        <h1 className="page-title" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title.name}
        </h1>
        <button
          className="btn btn-danger"
          onClick={handleDeleteTitle}
          style={{ padding: '6px 10px', fontSize: '12px' }}
          title="Delete from Library"
        >
          <Trash2 size={14} />
          <span>Remove Title</span>
        </button>
      </div>

      <div className="page-body">
        {/* Banner Card */}
        <div
          className="card"
          style={{
            display: 'flex',
            gap: '24px',
            background: 'linear-gradient(135deg, rgba(19, 27, 46, 0.9) 0%, rgba(15, 23, 42, 0.7) 100%)',
          }}
        >
          {/* Poster */}
          <div
            style={{
              width: '160px',
              height: '230px',
              backgroundColor: '#0e1526',
              borderRadius: '8px',
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)',
            }}
          >
            {title.posterPath ? (
              <img
                src={title.posterPath}
                alt={title.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Tv size={48} color="#475569" />
            )}
          </div>

          {/* Metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {title.name}
              </h2>
              {title.originalName && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  {title.originalName}
                </div>
              )}
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '700px', marginTop: '8px' }}>
                {title.description || 'No description available.'}
              </p>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Downloaded: <strong style={{ color: '#34d399' }}>{title.downloadedEpisodes}</strong> / {title.totalEpisodes} Episodes
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Source: {title.authorizedSource}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                {title.downloadedEpisodes > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleExportTitle}
                    title="Export all downloaded videos of this anime to phone, tablet, or USB"
                    style={{ padding: '8px 14px' }}
                  >
                    <Smartphone size={15} color="#38bdf8" />
                    <span>Export Anime ({title.downloadedEpisodes})</span>
                  </button>
                )}

                {title.continueWatchingEpisode && (
                  <button
                    className="btn btn-primary"
                    onClick={() => onPlayEpisode(title.continueWatchingEpisode!)}
                    style={{ padding: '8px 16px' }}
                  >
                    <Play size={16} />
                    <span>Resume (Ep {title.continueWatchingEpisode.episodeNumber})</span>
                  </button>
                )}

                <button
                  className="btn btn-secondary"
                  onClick={() => setShowSeasonModal(true)}
                  style={{ padding: '8px 14px' }}
                >
                  <Download size={16} />
                  <span>Download Season</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Season Tabs & Season Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {title.seasons.map((s, idx) => (
              <button
                key={s.id}
                className={`btn ${activeSeasonIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={() => setActiveSeasonIdx(idx)}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {downloadedInActiveSeason.length > 0 && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={handleBatchSeasonSubtitles}
                  disabled={isBatchSubtitling}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  title="Generate English subtitles for all downloaded episodes of this season with AI"
                >
                  {isBatchSubtitling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} color="#38bdf8" />}
                  <span>AI Subtitles Season ({downloadedInActiveSeason.length})</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={handleExportSeason}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  title="Export all downloaded episodes of this season"
                >
                  <Smartphone size={13} color="#38bdf8" />
                  <span>Export Season ({downloadedInActiveSeason.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {batchSubMessage && (
          <div
            style={{
              padding: '8px 14px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              color: '#38bdf8',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Sparkles size={14} />
            <span>{batchSubMessage}</span>
          </div>
        )}

        {/* Episodes List */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Episodes ({activeSeason ? activeSeason.episodes.length : 0})
          </h3>

          {!activeSeason || activeSeason.episodes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              No episodes recorded for this season yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeSeason.episodes.map((ep) => {
                const isDownloaded = ep.isDownloaded;
                const watchProgress = ep.watchProgress;
                const hasProgress = watchProgress && watchProgress.positionSeconds > 0;
                const isFinished = watchProgress?.isCompleted;

                return (
                  <div
                    key={ep.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    }}
                  >
                    {/* Left: Ep number, title, status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          backgroundColor: isDownloaded ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                          color: isDownloaded ? '#60a5fa' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {ep.episodeNumber}
                      </div>

                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          Episode {ep.episodeNumber} {ep.name && `— ${ep.name}`}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', marginTop: '2px' }}>
                          {isDownloaded ? (
                            <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle size={12} />
                              <span>Downloaded</span>
                              {ep.mediaFile?.fileSize && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  ({formatBytes(ep.mediaFile.fileSize)})
                                </span>
                              )}
                              {ep.mediaFile?.resolution && (
                                <span style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', color: '#cbd5e1' }}>
                                  {ep.mediaFile.resolution}
                                </span>
                              )}
                            </span>
                          ) : ep.isDownloading ? (
                            <span style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              <span>Downloading...</span>
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Circle size={12} />
                              <span>Not Downloaded</span>
                            </span>
                          )}

                          {/* Watch progress badge */}
                          {isFinished ? (
                            <span style={{ color: '#a78bfa' }}>• Watched</span>
                          ) : hasProgress ? (
                            <span style={{ color: '#fbbf24' }}>
                              • {Math.floor(watchProgress!.positionSeconds / 60)}m watched
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isDownloaded ? (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() => onPlayEpisode(ep)}
                            style={{ padding: '6px 14px', fontSize: '12px' }}
                          >
                            <Play size={14} />
                            <span>{hasProgress && !isFinished ? 'Resume' : 'Play'}</span>
                          </button>

                          {ep.mediaFile && (
                            <>
                              <button
                                className="btn-icon"
                                onClick={() => {
                                  setExportModalPayload({
                                    mediaFileIds: [ep.mediaFile!.id],
                                    totalBytes: ep.mediaFile!.fileSize,
                                    itemCount: 1,
                                    titleName: `${title.name} — Ep ${ep.episodeNumber}`,
                                  });
                                }}
                                title="Export episode to mobile phone, tablet, or USB"
                              >
                                <Smartphone size={14} color="#38bdf8" />
                              </button>

                              <button
                                className="btn-icon"
                                onClick={() => handleDeleteMedia(ep.mediaFile!.id, ep.name)}
                                title="Delete local file"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setShowSeasonModal(true)}
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                        >
                          <Download size={13} />
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Season Download Modal */}
      {showSeasonModal && activeSeason && (
        <SeasonDownloadModal
          title={{
            id: title.id,
            title: title.name,
            originalTitle: title.originalName,
            description: title.description,
            posterUrl: title.posterPath,
            authorizedSource: title.authorizedSource,
          }}
          seasonNumber={activeSeason.seasonNumber}
          episodes={activeSeason.episodes.map((e) => ({
            id: e.id,
            titleId: title.id,
            seasonNumber: activeSeason.seasonNumber,
            episodeNumber: e.episodeNumber,
            name: e.name,
          }))}
          onClose={() => setShowSeasonModal(false)}
          onSuccess={() => {
            setShowSeasonModal(false);
            onRefresh();
          }}
        />
      )}

      {/* Export Modal */}
      {exportModalPayload && (
        <ExportModal
          mediaFileIds={exportModalPayload.mediaFileIds}
          totalBytes={exportModalPayload.totalBytes}
          itemCount={exportModalPayload.itemCount}
          titleName={exportModalPayload.titleName}
          onClose={() => setExportModalPayload(null)}
          onExportStarted={() => {
            setExportModalPayload(null);
          }}
        />
      )}
    </div>
  );
};
