import React, { useState } from 'react';
import { Download, FileText, Plus, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
      if (
        host.includes('animepahe') ||
        host.includes('gogoanime') ||
        host.includes('zoro') ||
        host.includes('9anime') ||
        host.includes('aniwave') ||
        host.includes('crunchyroll')
      ) {
        const isDirectMedia = /\.(mp4|mkv|webm|ts|m3u8|avi|mov)($|\?)/i.test(path);
        if (!isDirectMedia) {
          return `Streaming portal webpage detected ("${parsed.hostname}"). AniScribe requires direct media stream links (.mp4, .mkv, .webm). Please copy the direct video or download link from the player/host instead of the website page URL.`;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  };

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const rawList =
      inputMode === 'single'
        ? [singleUrl]
        : batchUrls.split(/\r?\n/).map((u) => u.trim());

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
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

      <form onSubmit={handleAdd}>
        {inputMode === 'single' ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input"
              placeholder="Paste direct HTTP or HTTPS URL (e.g. https://example.com/file.zip)..."
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              disabled={submitting}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !singleUrl.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              <Plus size={16} />
              <span>Add to Queue</span>
            </button>
          </div>
        ) : (
          <div>
            <textarea
              className="textarea"
              placeholder="Paste multiple URLs, one per line..."
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              disabled={submitting}
              rows={4}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !batchUrls.trim()}
              >
                <Plus size={16} />
                <span>Add All to Queue</span>
              </button>
            </div>
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
