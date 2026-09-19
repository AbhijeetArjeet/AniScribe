import { IDatabase } from './database';

export function runMigrations(db: IDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      hostname TEXT NOT NULL,
      destination TEXT NOT NULL,
      total_size INTEGER NOT NULL DEFAULT 0,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      percentage REAL NOT NULL DEFAULT 0,
      speed REAL NOT NULL DEFAULT 0,
      eta INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Queued',
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      retry_at INTEGER,
      waiting_reason TEXT,
      range_supported INTEGER NOT NULL DEFAULT 0,
      queue_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      title TEXT,
      episode TEXT,
      quality TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_queue_order ON downloads (queue_order);
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads (status);

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      download_id TEXT,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      destination TEXT NOT NULL,
      total_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_completed_at ON history (completed_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Media Library Tables
    CREATE TABLE IF NOT EXISTS titles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT,
      description TEXT,
      poster_path TEXT,
      backdrop_path TEXT,
      authorized_source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_titles_name ON titles (name);

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      season_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      episode_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_seasons_title ON seasons (title_id);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      title_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration_seconds REAL,
      thumbnail_path TEXT,
      FOREIGN KEY (season_id) REFERENCES seasons (id) ON DELETE CASCADE,
      FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes (season_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_title ON episodes (title_id);

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      format TEXT NOT NULL,
      resolution TEXT,
      audio_track TEXT,
      download_date INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_files_episode ON media_files (episode_id);

    CREATE TABLE IF NOT EXISTS watch_progress (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL UNIQUE,
      title_id TEXT NOT NULL,
      position_seconds REAL NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      last_watched_at INTEGER NOT NULL,
      FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE CASCADE,
      FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_watch_progress_title ON watch_progress (title_id);
    CREATE INDEX IF NOT EXISTS idx_watch_progress_last_watched ON watch_progress (last_watched_at DESC);

    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      source_media_id TEXT,
      source_path TEXT NOT NULL,
      destination_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Queued',
      total_bytes INTEGER NOT NULL DEFAULT 0,
      copied_bytes INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_exports_created_at ON exports (created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_subtitle_jobs (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      season_number INTEGER NOT NULL,
      episode_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Queued',
      progress INTEGER NOT NULL DEFAULT 0,
      srt_path TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_ai_subtitle_jobs_status ON ai_subtitle_jobs (status);
    CREATE INDEX IF NOT EXISTS idx_ai_subtitle_jobs_title ON ai_subtitle_jobs (title_id, season_number);

    -- Cached ASR Segments (keyed by file_hash, pipeline_version, model_version, vad_settings)
    CREATE TABLE IF NOT EXISTS ai_asr_chunks (
      id TEXT PRIMARY KEY,
      file_hash TEXT NOT NULL,
      pipeline_version TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_version TEXT NOT NULL,
      vad_settings_hash TEXT NOT NULL,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      japanese_text TEXT NOT NULL,
      segments_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_asr_chunks_lookup 
      ON ai_asr_chunks (file_hash, pipeline_version, model_id, start_sec, end_sec);

    -- Cached Translation Cues (keyed by asr_chunk_id, translation_model, target_language)
    CREATE TABLE IF NOT EXISTS ai_translation_chunks (
      id TEXT PRIMARY KEY,
      asr_chunk_id TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      translation_model_id TEXT NOT NULL,
      translation_model_version TEXT NOT NULL,
      target_language TEXT NOT NULL DEFAULT 'en',
      english_text TEXT NOT NULL,
      cues_json TEXT NOT NULL,
      is_committed INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (asr_chunk_id) REFERENCES ai_asr_chunks (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_trans_lookup 
      ON ai_translation_chunks (file_hash, translation_model_id, target_language);

    -- Per-Title Glossary (Terms, Character Names, Honorific overrides)
    CREATE TABLE IF NOT EXISTS title_glossaries (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      source_term TEXT NOT NULL,
      target_term TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'term',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_title_glossaries_title ON title_glossaries (title_id);
  `);
}
