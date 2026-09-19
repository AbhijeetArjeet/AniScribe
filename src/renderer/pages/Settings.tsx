import React, { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { Folder, Save, Check, Sparkles, Cpu, HardDrive, Download, Trash2, ShieldCheck, Play, Loader2 } from 'lucide-react';
import { AiSubtitleConfig } from '../../shared/types/ai';
import { HardwareInfo, ModelMetadata, BenchmarkResult } from '../../shared/types/offlineEngine';

export const Settings: React.FC = () => {
  const { settings, updateSettings, selectDirectory } = useSettings();
  const [downloadDir, setDownloadDir] = useState(settings.downloadDirectory);
  const [concurrency, setConcurrency] = useState(settings.concurrency);
  const [maxRetries, setMaxRetries] = useState(settings.maxRetries);
  const [connectionTimeout, setConnectionTimeout] = useState(settings.connectionTimeoutMs / 1000);
  const [retryDelay, setRetryDelay] = useState(settings.retryDelayMs / 1000);
  const [theme, setTheme] = useState(settings.theme);
  const [filenameTemplate, setFilenameTemplate] = useState(settings.filenameTemplate);
  const [overwriteExisting, setOverwriteExisting] = useState(settings.overwriteExisting);
  const [saved, setSaved] = useState(false);

  // AI Subtitle Configuration State
  const [aiConfig, setAiConfig] = useState<AiSubtitleConfig>({
    provider: 'offline_engine',
    profile: 'balanced_rtx2050',
    model: 'whisper-small',
    endpointUrl: 'http://localhost:11434/v1',
    sourceLanguage: 'ja',
    targetLanguage: 'en',
    task: 'translate',
    vadSensitivity: 0.03,
    batchConcurrency: 1,
    apiKey: '',
  });

  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refreshModels = async () => {
    if (window.api?.getAllModels) {
      const list = await window.api.getAllModels();
      setModels(list);
    }
  };

  useEffect(() => {
    if (window.api) {
      window.api.getAiConfig().then((cfg) => {
        if (cfg) setAiConfig(cfg);
      });
      if (window.api.getHardwareInfo) {
        window.api.getHardwareInfo().then(setHardwareInfo);
      }
      refreshModels();
    }
  }, []);

  const handleInstallModel = async (id: string) => {
    if (!window.api?.installModel) return;
    await window.api.installModel(id);
    setActionMessage(`Installed model ${id}`);
    setTimeout(() => setActionMessage(null), 3000);
    refreshModels();
  };

  const handleDeleteModel = async (id: string) => {
    if (!window.api?.deleteModel) return;
    await window.api.deleteModel(id);
    setActionMessage(`Removed model ${id}`);
    setTimeout(() => setActionMessage(null), 3000);
    refreshModels();
  };

  const handleRunBenchmark = async () => {
    if (!window.api?.runBenchmark) return;
    setIsBenchmarking(true);
    try {
      const res = await window.api.runBenchmark();
      setBenchmarkResult(res);
    } catch {
      // ignore
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Sync state if settings update
  React.useEffect(() => {
    setDownloadDir(settings.downloadDirectory);
    setConcurrency(settings.concurrency);
    setMaxRetries(settings.maxRetries);
    setConnectionTimeout(settings.connectionTimeoutMs / 1000);
    setRetryDelay(settings.retryDelayMs / 1000);
    setTheme(settings.theme);
    setFilenameTemplate(settings.filenameTemplate);
    setOverwriteExisting(settings.overwriteExisting);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      downloadDirectory: downloadDir,
      concurrency: Math.max(1, Math.min(5, Number(concurrency))),
      maxRetries: Number(maxRetries),
      connectionTimeoutMs: Number(connectionTimeout) * 1000,
      retryDelayMs: Number(retryDelay) * 1000,
      theme,
      filenameTemplate,
      overwriteExisting,
    });

    if (window.api) {
      await window.api.updateAiConfig(aiConfig);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleBrowseDir = async () => {
    const dir = await selectDirectory();
    if (dir) {
      setDownloadDir(dir);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="page-body">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px' }}>
          {/* Download Directory */}
          <div className="card">
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Download Location
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                placeholder="Choose download folder..."
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBrowseDir}
                style={{ whiteSpace: 'nowrap' }}
              >
                <Folder size={15} />
                <span>Browse</span>
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Files and temporary .part chunks will be stored in this directory.
            </p>
          </div>

          {/* Concurrency & Retries */}
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Concurrent Downloads (1 - 5)
              </label>
              <select
                className="select"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              >
                <option value={1}>1 (Sequential)</option>
                <option value={2}>2</option>
                <option value={3}>3 (Recommended)</option>
                <option value={4}>4</option>
                <option value={5}>5 (Maximum)</option>
              </select>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Maximum number of parallel active downloads.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Maximum Retry Attempts
              </label>
              <input
                type="number"
                min={0}
                max={10}
                className="input"
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Number of automatic retries on network drops or 5xx errors.
              </p>
            </div>
          </div>

          {/* Timeouts & Delays */}
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Connection Timeout (Seconds)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                className="input"
                value={connectionTimeout}
                onChange={(e) => setConnectionTimeout(Number(e.target.value))}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Abort connection attempt if server doesn't respond.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Base Retry Delay (Seconds)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                className="input"
                value={retryDelay}
                onChange={(e) => setRetryDelay(Number(e.target.value))}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Initial backoff delay when server does not specify Retry-After.
              </p>
            </div>
          </div>

          {/* Filename Template */}
          <div className="card">
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              Filename Template
            </label>
            <input
              type="text"
              className="input"
              value={filenameTemplate}
              onChange={(e) => setFilenameTemplate(e.target.value)}
              placeholder="{title} - {episode} [{quality}].{ext}"
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Available variables: <code style={{ color: 'var(--accent)' }}>{'{title}'}</code>,{' '}
              <code style={{ color: 'var(--accent)' }}>{'{episode}'}</code>,{' '}
              <code style={{ color: 'var(--accent)' }}>{'{quality}'}</code>,{' '}
              <code style={{ color: 'var(--accent)' }}>{'{ext}'}</code>
            </p>
          </div>

          {/* File Overwrite & Theme */}
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                File Collision Behavior
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={overwriteExisting}
                  onChange={(e) => setOverwriteExisting(e.target.checked)}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Overwrite existing files (default: auto-rename to (1), (2))
                </span>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Appearance Theme
              </label>
              <select
                className="select"
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
              >
                <option value="dark">Dark (Default)</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>

          {/* AI Subtitles & Live Translation Configuration (RTX 2050 / Low-Resource) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  AI Subtitles & Live Translation (Japanese Dub → English)
                </h3>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                }}
              >
                RTX 2050 / Low-End Tuned
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                  Hardware / VRAM Profile
                </label>
                <select
                  className="select"
                  value={aiConfig.profile}
                  onChange={(e) => setAiConfig({ ...aiConfig, profile: e.target.value as any })}
                >
                  <option value="balanced_rtx2050">Balanced / RTX 2050 (Base/Small ~400-800MB VRAM)</option>
                  <option value="ultra_light">Ultra-Light (Tiny ~150MB VRAM / Battery Saving)</option>
                  <option value="high_quality">High Quality (Medium ~1.5GB VRAM)</option>
                  <option value="cloud_free">Zero-Resource Cloud (Groq Free Tier)</option>
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                  Leaves 3+ GB VRAM free on RTX 2050 for GPU video decoding.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                  Translation Provider
                </label>
                <select
                  className="select"
                  value={aiConfig.provider}
                  onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value as any })}
                >
                  <option value="offline_engine">Built-in Offline Engine (No Setup Required)</option>
                  <option value="local_whisper">Local Whisper / faster-whisper (Port 8080/9000)</option>
                  <option value="ollama">Local Ollama LLM (Port 11434)</option>
                  <option value="groq">Groq Cloud (Whisper-large-v3, Ultra-Fast Free)</option>
                  <option value="gemini">Google Gemini Flash Multimodal</option>
                  <option value="openai">OpenAI Whisper-1 API</option>
                </select>
              </div>
            </div>

            {/* Provider Specific Inputs */}
            {(aiConfig.provider === 'groq' || aiConfig.provider === 'gemini' || aiConfig.provider === 'openai') && (
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                  API Key ({aiConfig.provider.toUpperCase()})
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder={`Enter your ${aiConfig.provider} API key...`}
                  value={aiConfig.apiKey || ''}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                />
              </div>
            )}

            {(aiConfig.provider === 'local_whisper' || aiConfig.provider === 'ollama') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                    Local Endpoint URL
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={aiConfig.endpointUrl}
                    onChange={(e) => setAiConfig({ ...aiConfig, endpointUrl: e.target.value })}
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                    Model Identifier
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    placeholder="whisper-small or kotoba-whisper"
                  />
                </div>
              </div>
            )}

            {/* Live Hardware Detection Banner */}
            {hardwareInfo && (
              <div
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>Hardware Profile & Acceleration:</span>
                  <span style={{ color: hardwareInfo.cudaAvailable ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                    {hardwareInfo.cudaAvailable ? '● CUDA Hardware Accelerated' : '○ CPU Mode (Fallback)'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', color: '#cbd5e1' }}>
                  <div><strong>GPU:</strong> {hardwareInfo.gpuName}</div>
                  <div><strong>VRAM:</strong> {hardwareInfo.vramTotalMB > 0 ? `${hardwareInfo.vramTotalMB} MB` : 'Shared'}</div>
                  <div><strong>CPU:</strong> {hardwareInfo.cpuCores} cores</div>
                  <div><strong>RAM:</strong> {Math.round(hardwareInfo.totalRamMB / 1024)} GB</div>
                  <div><strong>Tier:</strong> <span style={{ textTransform: 'capitalize', color: '#60a5fa' }}>{hardwareInfo.recommendedTier}</span></div>
                </div>
              </div>
            )}

            {/* Local Model Registry Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Local Model Registry & Offline Installation:
                </span>
                {actionMessage && (
                  <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>{actionMessage}</span>
                )}
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                      <th style={{ padding: '8px 12px' }}>Model Name</th>
                      <th style={{ padding: '8px 12px' }}>Type</th>
                      <th style={{ padding: '8px 12px' }}>Size</th>
                      <th style={{ padding: '8px 12px' }}>VRAM Req</th>
                      <th style={{ padding: '8px 12px' }}>License</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>{m.name}</td>
                        <td style={{ padding: '8px 12px', textTransform: 'uppercase', color: '#94a3b8' }}>{m.type}</td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{m.sizeMB} MB</td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>~{m.requiredVramMB} MB</td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{m.license}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ color: m.installed ? '#34d399' : '#94a3b8', fontWeight: 600 }}>
                            {m.installed ? '✓ Installed' : '○ Available'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {m.installed ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteModel(m.id)}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                            >
                              <Trash2 size={11} />
                              <span>Delete</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleInstallModel(m.id)}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                            >
                              <Download size={11} />
                              <span>Install</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hardware Benchmark Runner */}
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                  Hardware Performance Benchmark:
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRunBenchmark}
                  disabled={isBenchmarking}
                  style={{ padding: '5px 12px', fontSize: '11px' }}
                >
                  {isBenchmarking ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  <span>{isBenchmarking ? 'Benchmarking...' : 'Run Benchmark'}</span>
                </button>
              </div>

              {benchmarkResult && (
                <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <div><strong>Device:</strong> <span style={{ textTransform: 'uppercase', color: '#38bdf8' }}>{benchmarkResult.device}</span></div>
                  <div><strong>Speed (RTF):</strong> <span style={{ color: '#34d399', fontWeight: 600 }}>{benchmarkResult.realtimeFactor}x ({(1 / benchmarkResult.realtimeFactor).toFixed(1)}x faster than real-time)</span></div>
                  <div><strong>Processing Time:</strong> {benchmarkResult.processingTimeMs}ms / {benchmarkResult.audioDurationSeconds}s audio</div>
                  <div><strong>Est. Peak VRAM:</strong> {benchmarkResult.peakVramMB} MB</div>
                </div>
              )}
            </div>

            {/* Specialized Anime Models & Datasets Note */}
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
                <Cpu size={14} />
                <span>Specialized Anime Models & Datasets Guide:</span>
              </div>
              <div>
                • <strong>faster-whisper (CTranslate2 INT8)</strong>: Runs 4x faster and consumes only ~400MB VRAM on RTX 2050.<br />
                • <strong>Kotoba-Whisper & ReazonSpeech</strong>: SOTA models trained on 19,000+ hours of Japanese broadcast and colloquial speech.<br />
                • <strong>Training Datasets</strong>: JTubeSpeech (1,300 hrs), LaboroTVSpeech (2,000 hrs), and Kitsunekko/Jimaku paired fansub corpora.
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '9px 20px' }}>
              <Save size={16} />
              <span>Save Settings</span>
            </button>
            {saved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '13px' }}>
                <Check size={16} />
                <span>Settings saved successfully</span>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
