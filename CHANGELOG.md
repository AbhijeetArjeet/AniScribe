# Changelog

All notable changes to BatchFetch are documented in this file.

## [1.2.0] - 2026-09-19

### Added
- **Mobile & Tablet Export Subsystem**:
  - Export single episodes, seasons, or entire titles to standard playable `.mp4`/`.mkv` files.
  - Safe non-destructive copying with chunked streaming, progress reporting (MB/s, ETA), and cancellation.
  - Filename collision handling (`rename`, `replace`, `skip`).
  - Removable drive detection on Windows (USB drives, SD cards).
  - Export Center page (`/export`) and Export Modal.
- **Storage Management Dashboard**:
  - Storage page (`/storage`) displaying total library size, free disk space, catalog counts, per-title breakdown, and largest files list.
  - Bulk cleanup of watched episodes.
  - Safe library relocation and file migration workflow.
- **Strengthened Provider Framework**:
  - `ProviderAdapter`, `ProviderRegistry`, and `ProviderManager`.
  - Built-in offline `MockProvider` for testing and development.
  - Resilient error handling for offline states, rate limits, and 404s.
- **Validation Matrix & Reports**:
  - Real-world validation suite (`tests/packagedAppValidation.test.ts`).
  - `FINAL_VALIDATION.md` detailing packaged app testing and metrics.

## [1.1.0] - 2026-09-19

### Added
- **Offline Media Library & Desktop Player**:
  - SQLite entity hierarchy: `Title` $\to$ `Season` $\to$ `Episode` $\to$ `MediaFile` + `WatchProgress`.
  - Automated download-to-library mover placing completed media in `<Library>/<Title>/Season <SS>/`.
  - Privileged `media://` streaming protocol supporting HTTP Range seeking.
  - Desktop HTML5 video player with keyboard shortcuts, watch progress persistence, and auto-resume.
  - Batch Season Download modal.

## [1.0.0] - 2026-09-19

### Initial Release
- Multi-connection concurrent download manager with byte-range slicing.
- SQLite persistence in WAL mode.
- Context-isolated, sandboxed Electron architecture.
