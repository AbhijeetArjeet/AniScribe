# BatchFetch — Offline Media Library & Video Player Documentation

## 1. Architectural Overview

BatchFetch has been extended into a self-contained, offline-first media library and desktop video player for authorized media downloads. 

The application adheres strictly to authorized direct downloads:
- **No web scraping** (no site-specific scrapers).
- **No anti-bot or Cloudflare bypass**.
- **No CAPTCHA solving**.
- **No authentication bypass or DRM circumvention**.
- Consumes authorized JSON APIs via the `ProviderAdapter` abstraction to obtain direct HTTP/HTTPS URLs.
- Operates **100% offline**: Once media is downloaded, titles, episodes, watch progress, and video playback function completely without internet access or provider API availability.

---

## 2. SQLite Schema & Entity Hierarchy

The SQLite database (`batchfetch.db`, operating in WAL mode) persists the media hierarchy:

```
Title
 └── Season
      └── Episode
           ├── MediaFile
           └── WatchProgress
```

### Table Definitions

#### `titles`
- `id` (TEXT PRIMARY KEY): Unique identifier (e.g. `title-<hash>`).
- `name` (TEXT NOT NULL): Display title.
- `original_name` (TEXT): Kanji / native title.
- `description` (TEXT): Synopsis / description.
- `poster_path` (TEXT): Local or authorized remote poster URL.
- `backdrop_path` (TEXT): Hero banner URL.
- `authorized_source` (TEXT NOT NULL): Source origin provider name.
- `created_at` (INTEGER NOT NULL): Epoch timestamp.

#### `seasons`
- `id` (TEXT PRIMARY KEY): e.g. `title-<hash>-s1`.
- `title_id` (TEXT NOT NULL, FK -> `titles(id)` ON DELETE CASCADE).
- `season_number` (INTEGER NOT NULL).
- `name` (TEXT NOT NULL): e.g. `Season 1`.
- `episode_count` (INTEGER NOT NULL DEFAULT 0).

#### `episodes`
- `id` (TEXT PRIMARY KEY): e.g. `title-<hash>-s1-e1`.
- `season_id` (TEXT NOT NULL, FK -> `seasons(id)` ON DELETE CASCADE).
- `title_id` (TEXT NOT NULL, FK -> `titles(id)` ON DELETE CASCADE).
- `episode_number` (INTEGER NOT NULL).
- `name` (TEXT NOT NULL): Episode title or label.
- `duration_seconds` (INTEGER): Runtime in seconds.
- `thumbnail_path` (TEXT): Episode preview thumbnail.

#### `media_files`
- `id` (TEXT PRIMARY KEY): Unique media file record ID.
- `episode_id` (TEXT NOT NULL, FK -> `episodes(id)` ON DELETE CASCADE).
- `file_path` (TEXT NOT NULL): Absolute local file path on disk.
- `file_size` (INTEGER NOT NULL): File size in bytes.
- `format` (TEXT NOT NULL): File container (`mp4`, `mkv`, etc.).
- `resolution` (TEXT): Video resolution (`1080p`, `720p`, `480p`).
- `audio_track` (TEXT): Audio language / track tag.
- `download_date` (INTEGER NOT NULL): Epoch timestamp.
- `verified` (INTEGER NOT NULL DEFAULT 1): Integrity verification flag.

#### `watch_progress`
- `id` (TEXT PRIMARY KEY): Watch progress ID.
- `episode_id` (TEXT NOT NULL UNIQUE, FK -> `episodes(id)` ON DELETE CASCADE).
- `title_id` (TEXT NOT NULL, FK -> `titles(id)` ON DELETE CASCADE).
- `position_seconds` (INTEGER NOT NULL DEFAULT 0): Resumable playback position.
- `duration_seconds` (INTEGER NOT NULL DEFAULT 0): Total media duration.
- `is_completed` (INTEGER NOT NULL DEFAULT 0): Watched completion flag ($1$ if completed).
- `last_watched_at` (INTEGER NOT NULL): Epoch timestamp.

---

## 3. Library Directory Layout & Automated Mover

When a download belonging to an authorized season or title finishes in `DownloadManager`, `LibraryManager.organizeCompletedDownload()` is automatically invoked.

### Disk Structure
```
<DownloadDirectory>/
 └── Library/
      └── <Title Name>/
           └── Season <SS>/
                └── <Title Name> - S<SS>E<EE> [<Quality>].<ext>
```
Example:
```
C:/Users/User/Downloads/
 └── Library/
      └── Bocchi the Rock!/
           └── Season 01/
                ├── Bocchi the Rock! - S01E01 [1080p].mp4
                └── Bocchi the Rock! - S01E02 [1080p].mp4
```

### Features:
1. **Atomic Move & Rename**: Moves the completed file from the temporary download folder to the clean library folder structure.
2. **Database Registration**: Upserts the `Title`, `Season`, `Episode`, and `MediaFile` records with the exact path on disk.
3. **Local Disk Scanner**: "Scan Local Files" button (`window.api.scanLibrary()`) recursively traverses `<DownloadDirectory>/Library/`, automatically parsing title, season, and episode numbers, and registering any newly placed local files into SQLite.

---

## 4. HTML5 Video Player & Secure `media://` Streaming

### Architecture
Direct `file:///` URLs inside sandboxed Electron renderers are blocked by web security and Content Security Policy (CSP). BatchFetch implements a custom privileged protocol:

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
```

The protocol handler in `src/main/player/protocolHandler.ts` intercepts requests like:
`media://local/${encodeURIComponent(filePath)}`

It uses `net.fetch(pathToFileURL(cleanPath).toString(), { headers: request.headers })` which natively satisfies HTTP `Range: bytes=start-end` request headers. This enables:
- Fast, instant scrubbing across multi-gigabyte video files.
- Hardware-accelerated local decoding.
- Full compatibility with Chromium HTML5 `<video>` tags.

### Resume & Progress Persistence
- On video open: retrieves `WatchProgress` for the episode. If position $> 5\text{s}$ and $< \text{duration} - 15\text{s}$, automatically seeks to the saved timestamp.
- While playing: periodically saves the playback position every 4 seconds.
- On pause, seek, unmount, or close: immediately flushes current position to SQLite.
- On episode completion ($> 90\%$ or video `ended` event): marks episode as completed and automatically transitions to the next episode if available.

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Space` | Play / Pause toggle |
| `Left Arrow` | Seek backward 5 seconds |
| `Right Arrow` | Seek forward 5 seconds |
| `Up Arrow` | Increase volume (+10%) |
| `Down Arrow` | Decrease volume (-10%) |
| `M` | Mute / Unmute toggle |
| `F` | Toggle Fullscreen |
| `N` | Play Next Episode |
| `P` | Play Previous Episode |
| `Esc` | Exit Fullscreen / Return to Title Detail |

---

## 5. UI Features & Workflow

### 1. Library Page (`/src/renderer/pages/Library.tsx`)
- **Filter Tabs**:
  - `All Titles`: Complete library catalog.
  - `Continue Watching`: Filter and sort by recently watched incomplete titles with direct 1-click "Resume Ep X" button.
  - `Recently Added`: Titles with downloaded media.
  - `Completed`: Titles where all episodes have been downloaded.
- **Search Bar**: Real-time filtering across titles and original titles.
- **Scan Local Files**: Rescans the disk for externally added files.

### 2. Title Detail Page (`/src/renderer/pages/TitleDetail.tsx`)
- Banner with poster, title, original Japanese name, description, and source badge.
- Season switcher tabs.
- Episode status indicators:
  - `✓ Downloaded` (with local file size and resolution badge).
  - `↓ Downloading` (for in-flight queue items).
  - `○ Not Downloaded`.
- `[ Download Season ]` button: opens batch download modal.
- Remove title / remove media file options.

### 3. Season Download Modal (`/src/renderer/components/SeasonDownloadModal.tsx`)
- Allows selecting resolution (1080p, 720p, 480p) and audio track.
- Select all / individual episode checkboxes.
- Batches episodes directly into the core `DownloadManager` queue using template `{title} - S{season}E{episode} [{quality}].{ext}`.

---

## 6. Verification & Automated Test Coverage

The test suite consists of 16 test files and 42 tests passing:
- `tests/libraryRepository.test.ts`: SQLite hierarchy, cascade deletes, next/previous episode traversal, and category filters.
- `tests/libraryOrganizer.test.ts`: File moving to `<Library>/<Title>/Season <SS>/` and disk scanning.
- `tests/seasonDownload.test.ts`: Batch queueing season episodes through `DownloadManager`.
- `tests/offlinePlayer.test.ts`: 100% offline database operation, missing media file detection, and watch progress resumption across restarts.
- `tests/provider.test.ts`: Authorized API consumption without scraping.
- `tests/downloader.test.ts`, `tests/queue.test.ts`, `tests/storage.test.ts`, `tests/retry.test.ts`, `tests/performance.test.ts`, `tests/integration.test.ts`: Core engine, concurrency, retry, and crash-recovery verification.
