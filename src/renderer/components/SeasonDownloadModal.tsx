import React, { useState } from 'react';
import { TitleMetadata, EpisodeMetadata, DownloadVariant } from '../../shared/types/provider';
import { DownloadSeasonPayload } from '../../shared/types/ipc';
import { X, Download, CheckSquare, Square } from 'lucide-react';

interface SeasonDownloadModalProps {
  title: TitleMetadata;
  seasonNumber: number;
  episodes: EpisodeMetadata[];
  onClose: () => void;
  onSuccess: () => void;
}

export const SeasonDownloadModal: React.FC<SeasonDownloadModalProps> = ({
  title,
  seasonNumber,
  episodes,
  onClose,
  onSuccess,
}) => {
  const [selectedEpisodes, setSelectedEpisodes] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const ep of episodes) {
      init[ep.id] = true;
    }
    return init;
  });

  const [quality, setQuality] = useState('1080p');
  const [audioTrack, setAudioTrack] = useState('Original');
  const [subtitles, setSubtitles] = useState('English');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAll = (select: boolean) => {
    const next: Record<string, boolean> = {};
    for (const ep of episodes) {
      next[ep.id] = select;
    }
    setSelectedEpisodes(next);
  };

  const toggleEp = (id: string) => {
    setSelectedEpisodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selectedEpisodes).filter(Boolean).length;

  const handleDownload = async () => {
    if (selectedCount === 0) {
      setError('Please select at least one episode to download.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const episodesToDownload = episodes.filter((ep) => selectedEpisodes[ep.id]);
      const variants: Record<string, DownloadVariant> = {};

      // Build mock or provider variants for each episode
      for (const ep of episodesToDownload) {
        // If provider gives variants or fallback
        variants[ep.id] = {
          id: `var-${ep.id}-${quality}`,
          episodeId: ep.id,
          quality,
          audioTrack,
          subtitles: [subtitles],
          // Generate direct authorized download link
          directUrl: `https://authorized.storage.provider.net/media/${title.id}/s${seasonNumber}/ep${ep.episodeNumber}_${quality}.mp4`,
          format: 'mp4',
        };
      }

      const payload: DownloadSeasonPayload = {
        title,
        seasonNumber,
        episodes: episodesToDownload,
        quality,
        audioTrack,
        subtitles,
        variants,
      };

      await window.api.downloadSeason(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to start season download');
    } finally {
      setSubmitting(false);
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
          width: '540px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Download Season {seasonNumber}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{title.title}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Options Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Quality
            </label>
            <select className="select" value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="1080p">1080p Full HD</option>
              <option value="720p">720p HD</option>
              <option value="480p">480p SD</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Audio Track
            </label>
            <select className="select" value={audioTrack} onChange={(e) => setAudioTrack(e.target.value)}>
              <option value="Original">Original</option>
              <option value="English">English Dub</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Subtitles
            </label>
            <select className="select" value={subtitles} onChange={(e) => setSubtitles(e.target.value)}>
              <option value="English">English</option>
              <option value="None">None</option>
            </select>
          </div>
        </div>

        {/* Episode Checkboxes */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Selected: <strong>{selectedCount}</strong> of {episodes.length}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => toggleAll(true)}
            >
              Select All
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => toggleAll(false)}
            >
              Deselect All
            </button>
          </div>
        </div>

        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '8px',
            borderRadius: '6px',
          }}
        >
          {episodes.map((ep) => {
            const isChecked = Boolean(selectedEpisodes[ep.id]);
            return (
              <div
                key={ep.id}
                onClick={() => toggleEp(ep.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                }}
              >
                {isChecked ? (
                  <CheckSquare size={16} color="#3b82f6" />
                ) : (
                  <Square size={16} color="#64748b" />
                )}
                <span style={{ fontSize: '12px', color: isChecked ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Episode {ep.episodeNumber}: {ep.name}
                </span>
              </div>
            );
          })}
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: '12px' }}>{error}</div>}

        {/* Action Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={submitting || selectedCount === 0}
          >
            <Download size={15} />
            <span>Queue {selectedCount} Episode{selectedCount === 1 ? '' : 's'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
