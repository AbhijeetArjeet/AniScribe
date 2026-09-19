import React, { useState, useEffect } from 'react';
import { Download, FileText, Plus, AlertCircle, ChevronDown, ChevronUp, Globe, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { TemplateContext } from '../../shared/types/settings';
import { VariantSelector } from './VariantSelector';
import { VariantOptions, VariantSelection } from '../../shared/types/variant';

interface UrlInputProps {
  onAddUrls: (urls: string[], templateContext?: TemplateContext) => Promise<any>;
  onImportTxt: () => Promise<string[]>;
}

// Sample authorized provider variants (can be supplied or customized)
const SAMPLE_VARIANTS: VariantOptions = {
  qualities: ['Maximum Available', '1080p', '720p', '480p'],
  audio: ['Original', 'English'],
  subtitles: ['None', 'English'],
};

export const UrlInput: React.FC<UrlInputProps> = ({ onAddUrls, onImportTxt }) => {
  const [inputMode, setInputMode] = useState<'single' | 'batch'>('single');
  const [singleUrl, setSingleUrl] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [capturedCount, setCapturedCount] = useState<number>(0);

  // Template Context fields
  const [showMetadata, setShowMetadata] = useState(false);
  const [title, setTitle] = useState('');
  const [episode, setEpisode] = useState('');
  const [variants] = useState<VariantOptions>(SAMPLE_VARIANTS);
  const [selectedVariant, setSelectedVariant] = useState<VariantSelection>({
    quality: 'Maximum Available',
    audio: 'Original',
    subtitles: 'None',
  });

  useEffect(() => {
    if (window.api?.onSnifferStreamsUpdated) {
      const unsub = window.api.onSnifferStreamsUpdated((streams) => {
        setCapturedCount(streams?.length || 0);
      });
      return unsub;
    }
  }, []);

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isKnownPortalWebpage = (urlStr: string): string | null => {
    try {
      const parsed = new URL(urlStr.trim());
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      // Animepahe is handled directly by the In-App Browser & Batch Extractor
      if (host.includes('animepahe') || host.includes('kwik.')) {
        return null;
      }

      if (
        host.includes('gogoanime') ||
        host.includes('zoro') ||
        host.includes('9anime') ||
        host.includes('aniwave') ||
        host.includes('crunchyroll')
      ) {
        const isDirectMedia = /\.(mp4|mkv|webm|ts|m3u8|avi|mov)($|\?)/i.test(path);
        if (!isDirectMedia) {
          return `Streaming portal webpage detected ("${parsed.hostname}"). Use the In-App Browser & Sniffer toolbar to capture direct media streams.`;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  };

  const isAnimepahe =
    singleUrl.includes('animepahe.pw') ||
    batchUrls.includes('animepahe.pw') ||
    singleUrl.includes('kwik.') ||
    batchUrls.includes('kwik.');

  const handleBatchExtractAnimepahe = async (urlToExtract: string) => {
    setError(null);
    setExtractStatus(null);
    setExtracting(true);
    try {
      setExtractStatus('Connecting to in-app session & extracting episodes...');
      const res = await window.api.batchExtractAnimepahe(urlToExtract);
      if (res && res.queuedCount > 0) {
        setExtractStatus(`✓ Successfully extracted & queued ${res.queuedCount} episodes for "${res.animeTitle}"!`);
        setSingleUrl('');
      } else {
        setExtractStatus('Opening In-App Browser to solve Cloudflare challenge or start playback...');
        window.api.openSniffer(urlToExtract);
      }
    } catch (err: any) {
      setError(`Extraction error: ${err.message}. Opening In-App Browser for manual solve...`);
      window.api.openSniffer(urlToExtract);
    } finally {
      setExtracting(false);
    }
  };

  const handleOpenBrowser = (url?: string) => {
    const target = url || singleUrl.trim() || 'https://animepahe.pw';
    window.api.openSniffer(target);
  };

  const handleQueueCaptured = async () => {
    try {
      const count = await window.api.queueCapturedStreams(title.trim() || undefined);
      setExtractStatus(`✓ Successfully queued ${count} sniffed media stream(s) into download engine.`);
      setCapturedCount(0);
    } catch (err: any) {
      setError(`Failed to queue captured streams: ${err.message}`);
    }
  };

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setExtractStatus(null);

    const rawList =
      inputMode === 'single'
        ? [singleUrl]
        : batchUrls.split(/\r?\n/).map((u) => u.trim());

    // If a single animepahe URL was submitted via Add button, route to batch extract
    if (rawList.length === 1 && rawList[0].includes('animepahe.pw')) {
      await handleBatchExtractAnimepahe(rawList[0]);
      return;
    }

    const validList: string[] = [];
    for (const u of rawList) {
      const trimmed = u.trim();
      if (!trimmed) continue;
      if (!validateUrl(trimmed)) {
        setError(`Invalid or unsupported URL: "${trimmed}". Only HTTP and HTTPS are supported.`);
        return;
      }
      const portalWarning = isKnownPortalWebpage(trimmed);
      if (portalWarning) {
        setError(portalWarning);
        return;
      }
      validList.push(trimmed);
    }

    if (validList.length === 0) {
      setError('Please enter at least one valid HTTP or HTTPS URL.');
      return;
    }

    const templateContext: TemplateContext = {
      title: title.trim() || undefined,
      episode: episode.trim() || undefined,
      quality: selectedVariant.quality,
    };

    setSubmitting(true);
    try {
      await onAddUrls(validList, templateContext);
      setSingleUrl('');
      setBatchUrls('');
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to add downloads');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTxtImport = async () => {
    setError(null);
    try {
      const imported = await onImportTxt();
      if (imported && imported.length > 0) {
        if (inputMode === 'single') {
          setInputMode('batch');
          setBatchUrls(imported.join('\n'));
        } else {
          setBatchUrls((prev) => (prev ? `${prev}\n${imported.join('\n')}` : imported.join('\n')));
        }
      }
    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${inputMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setInputMode('single')}
          >
            Single URL
          </button>
          <button
            type="button"
            className={`btn ${inputMode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setInputMode('batch')}
          >
            Multiple URLs
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {capturedCount > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: '12px', background: '#10b981', borderColor: '#10b981' }}
              onClick={handleQueueCaptured}
              title="Add sniffed video streams to download queue"
            >
              <Download size={14} />
              <span>Queue Captured ({capturedCount})</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #6366f1' }}
            onClick={() => handleOpenBrowser()}
            title="Open In-App Browser to solve Cloudflare or sniff media"
          >
            <Globe size={14} color="#818cf8" />
            <span>In-App Browser & Sniffer</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={handleTxtImport}
            title="Import URLs from .txt file"
          >
            <FileText size={14} />
            <span>Import TXT</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleAdd}>
        {inputMode === 'single' ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input"
              placeholder="Paste direct URL, Animepahe link (e.g. https://animepahe.pw/anime/...), or Kwik stream..."
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              disabled={submitting || extracting}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || extracting || !singleUrl.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {isAnimepahe ? <Zap size={16} /> : <Plus size={16} />}
              <span>{isAnimepahe ? 'Batch Extract' : 'Add to Queue'}</span>
            </button>
          </div>
        ) : (
          <div>
            <textarea
              className="textarea"
              placeholder="Paste multiple URLs or Animepahe links, one per line..."
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              disabled={submitting || extracting}
              rows={4}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || extracting || !batchUrls.trim()}
              >
                <Plus size={16} />
                <span>Add All to Queue</span>
              </button>
            </div>
          </div>
        )}

        {/* Animepahe Cloudflare Helper Banner */}
        {isAnimepahe && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a5b4fc', fontSize: '13px', fontWeight: 600 }}>
                <Sparkles size={16} />
                <span>Animepahe & Kwik Stream Batch Resolver</span>
              </div>
              <span style={{ fontSize: '11px', color: '#38bdf8', background: '#1e293b', padding: '2px 8px', borderRadius: '12px' }}>
                Cloudflare Bypass & Media Sniffer Ready
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Animepahe series URL detected. You can extract all episodes automatically into AniScribe's queue. If Cloudflare prompts for human verification ("Just a moment..."), click <strong>Open In-App Browser</strong> to solve it manually and stream/sniff instantly.
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: '12px', background: '#6366f1', borderColor: '#6366f1' }}
                onClick={() => handleBatchExtractAnimepahe(singleUrl.trim() || batchUrls.trim())}
                disabled={extracting}
              >
                <Zap size={14} />
                <span>{extracting ? 'Extracting Series...' : '⚡ Batch Extract All Episodes'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={() => handleOpenBrowser(singleUrl.trim() || batchUrls.trim())}
              >
                <Globe size={14} />
                <span>🌐 Open In-App Browser (Solve Cloudflare / Sniff)</span>
              </button>
            </div>
          </div>
        )}

        {/* Status / Success Banner */}
        {extractStatus && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#34d399',
              fontSize: '12px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{extractStatus}</span>
          </div>
        )}

        {/* Metadata & Template Accordion */}
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-secondary)' }}
            onClick={() => setShowMetadata(!showMetadata)}
          >
            {showMetadata ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Filename Metadata & Variants (Optional)</span>
          </button>

          {showMetadata && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Title {'{title}'}
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Cyberpunk"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Episode {'{episode}'}
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. S01E01"
                    value={episode}
                    onChange={(e) => setEpisode(e.target.value)}
                  />
                </div>
              </div>

              {/* Generic VariantSelector */}
              <VariantSelector
                variants={variants}
                selected={selectedVariant}
                onChange={setSelectedVariant}
              />
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '12px' }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};
