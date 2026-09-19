# Contributing to BatchFetch

Thank you for contributing to BatchFetch!

## Development Guidelines

1. **Safety & Legal Boundary**:
   - Do NOT submit pull requests that implement site scrapers, bot bypasses, DRM circumvention, or token theft.
   - Provider integrations must strictly adhere to authorized API specifications returning direct HTTP/HTTPS URLs.
   - The built-in `DownloadManager` must remain the only download engine.

2. **Architecture**:
   - Main process handles all Node.js and SQLite operations.
   - Preload script exposes typed, sanitized IPC functions.
   - Renderer is written in React + TypeScript and must remain free of Node.js dependencies.

3. **Verification**:
   Before submitting changes, ensure all verification steps pass:
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```
