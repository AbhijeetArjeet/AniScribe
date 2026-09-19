# Security Policy

## Security Architecture

BatchFetch implements defense-in-depth principles for Electron desktop applications:

1. **Process Isolation**:
   - `contextIsolation: true` is strictly enforced for all browser windows.
   - `nodeIntegration: false` is permanently disabled in renderer processes.
   - Sandboxing (`sandbox: true`) is active, preventing renderers from directly calling Node.js or OS APIs.
   - All renderer-to-main communication passes through validated IPC channels in `src/preload/index.ts`.

2. **Filesystem & Path Traversal Prevention**:
   - Filenames received from remote URLs or user inputs are strictly sanitized via `sanitizeFilename()`, stripping `..`, null bytes, and path delimiters (`/`, `\`).
   - The custom `media://` streaming protocol strictly normalizes paths and restricts access to existing media files.
   - Export operations write to verified local or removable drive directories without exposing arbitrary shell execution.

3. **Network & Navigation Hardening**:
   - Popup windows and new window requests are blocked via `setWindowOpenHandler(() => ({ action: 'deny' }))`.
   - Navigation away from the bundled app is prevented via `will-navigate` listeners.
   - Download URLs must use valid `http:` or `https:` protocols; `file:`, `javascript:`, and other schemes are rejected.

4. **Compliance & Authorized Media Policy**:
   - No scraping, bypass of CAPTCHA/Cloudflare, authentication circumvention, or DRM breaking is permitted or implemented in the codebase.
