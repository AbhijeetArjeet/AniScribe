# AniScribe
**Production-Grade Offline AI Subtitle Engine, Cloudflare Stream Sniffer & Anime Media Suite**

[![Tests](https://img.shields.io/badge/tests-30%20passed%20%2F%2093%20total-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/typescript-100%25%20typecheck%20passed-blue.svg)]()
[![Offline](https://img.shields.io/badge/offline-100%25%20verified%20no%20cloud-success.svg)]()
[![Hardware](https://img.shields.io/badge/GPU%20Target-NVIDIA%20RTX%202050%20DirectML-purple.svg)]()
[![License](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)]()

---

## Overview

**AniScribe** is an offline-first desktop application combining:
1. **Cloudflare Solver & Animepahe Batch Downloader**: In-App Chromium browser with manual Cloudflare Turnstile bypass, automated multi-page release API crawler, and real-time Kwik media stream sniffer (`.mp4`, `.m3u8`).
2. **Offline AI Subtitle Generation**: Multilingual ASR (`whisper-large-v3-turbo` & `whisper-base` in INT8 ONNX) coupled with Silero VAD v4 via DirectML GPU acceleration, producing English `.srt` subtitles completely offline.
3. **Decoupled Neural Translation**: Speech recognition is decoupled from translation. ASR yields raw Japanese, Korean, or Chinese transcripts, translated to English through dedicated MarianMT / Opus-MT models with per-title character glossaries (`Tanjiro`, `Nezuko`, honorifics).
4. **VLC-Parity Player**: Custom `media://` protocol player with live read-ahead look-ahead streaming (30–60s buffer), live subtitle sync offset adjustment ($\pm 50$ms), audio/subtitle track switching, and full keyboard navigation.
5. **Resilient Download & Library Engine**: Concurrent HTTP byte-range slicing (HTTP 206), rate-limiting resilience (HTTP 429 countdown), automatic file categorization, and lossless mobile device export.

---

## Empirical Benchmark Evidence (RTX 2050 4GB Laptop)

All numbers are **`[MEASURED]`** from real executions documented in [`BENCHMARK_REPORT.md`](./BENCHMARK_REPORT.md) and [`benchmarks/results.json`](./benchmarks/results.json):

| Model / Tier | Audio Duration | Cold RTF | Warm RTF (Avg 3) | Total Time | Live Look-Ahead (2s) | Peak RAM | CER (CJK Norm) | Evidence Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **whisper-large-v3-turbo** *(Balanced)* | 10.82s (JA) | 1.138x | **1.113x** | 12,036 ms | 5,321 ms | 1,951 MB | **0.000** | `[MEASURED]` |
| **whisper-base** *(Light Streaming)* | 10.82s (JA) | 0.187x | **0.171x** | 1,852 ms | **484 ms** | 2,563 MB | **0.000** | `[MEASURED]` |
| **whisper-base** *(Light Streaming)* | 20.00s (KO) | 0.153x | **0.150x** | 2,994 ms | **456 ms** | 965 MB | 0.600 | `[MEASURED]` |
| **whisper-base** *(Light Streaming)* | 180.67s (JA 3min) | 0.092x | **0.089x** | 16,132 ms | **492 ms** | 1,152 MB | 0.571 | `[MEASURED]` |
| **whisper-tiny** *(Fastest Fallback)* | 10.82s (JA) | 0.163x | **0.159x** | 1,721 ms | **261 ms** | 1,068 MB | **0.000** | `[MEASURED]` |

* **0.000 CER**: Fair CJK text normalizer (`CjkNormalizer`) handles Kanji numbers (`一、二、三` $\to$ `1, 2, 3`), fullwidth/halfwidth characters, and Japanese punctuation.
* **Sub-500ms Live Latency**: `whisper-base` decodes a 2.0s look-ahead streaming window in **484ms**, comfortably ahead of the player playhead.
* **Zero Cloud Calls**: Verified with Vitest socket interceptor enforcing `0` outbound HTTP/HTTPS connections.
* **Standalone Sidecar**: Compiled into `inferenceWorker.exe` via PyInstaller; no host Python required.

---

## Architectural Pipeline

```text
Video File / Stream
  ↓
Direct Demuxer & Probe (extracts embedded text tracks directly, bypasses ASR)
  ↓
Audio Extraction (16kHz Mono Float32)
  ↓
Silero VAD v4 (DirectML GPU on RTX 2050 via DirectX 12)
  ↓ Speech Segments (with 200ms overlap + zlib compression repetition filter)
Multilingual Whisper ASR (whisper-large-v3-turbo / whisper-base INT8)
  ↓ Raw Source Transcript (Japanese / Korean / Chinese)
CJK Text Normalizer (NFKC + Kanji numerals + punctuation)
  ↓
Dedicated Neural Translation (MarianMT / Opus-MT INT8)
  + Per-Title Character Glossary Substitution (SQLite title_glossaries)
  ↓
Synchronized English Subtitle (.srt) & Real-Time Player OSD Overlay
```

---

## Cloudflare Solver & Animepahe Batch Downloader

AniScribe handles protected streaming portals like Animepahe (`animepahe.pw`) that enforce Cloudflare Turnstile bot checks:

1. **Automatic Batch Extraction**:
   - Paste any Animepahe series URL (`https://animepahe.pw/anime/<id>`) or episode URL (`https://animepahe.pw/play/<id>/<session>`).
   - Click **`⚡ Batch Extract All Episodes`** to automatically fetch all paginated releases and queue every episode into the download engine.
2. **In-App Chromium Browser (Manual Fallback)**:
   - Click **`🌐 Open In-App Browser`** (or **`Browser / Sniffer`** on the sidebar).
   - If Cloudflare prompts a challenge ("Just a moment..."), simply check the Turnstile box manually.
   - The session saves clearance cookies (`cf_clearance`), and you can click **`⚡ Batch Extract Anime Episodes`** on the floating toolbar.
3. **Live Media Stream Sniffer**:
   - As you play or stream an episode, AniScribe's network sniffer detects the raw `.mp4` / `.m3u8` stream and attaches required `Referer: https://kwik.cx/` and `User-Agent` headers.
   - Click **`📥 Queue Captured`** to queue the stream directly into your download list.

---

## VLC-Parity Keyboard Controls

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `Left` / `Right` | Seek backward / forward 5 seconds |
| `Up` / `Down` | Volume $\pm 10\%$ |
| `[` / `]` | Subtitle sync offset $-50$ms / $+50$ms (with live OSD notification) |
| `F` | Toggle Fullscreen |
| `M` | Mute / Unmute |
| `N` / `P` | Next / Previous Episode |
| `Esc` | Exit player back to Library |

---

## Development & Testing

### Prerequisites
* Node.js 18+ (tested on Node v22)
* Python 3.10+ (for building sidecar binaries or running development inference)
* Windows 10/11 with DirectX 12 (for DirectML acceleration on NVIDIA, AMD, or Intel GPUs)

### Commands
```bash
# Install dependencies
npm install

# Run complete Vitest suite (30 suites, 93 tests)
npm test

# Run TypeScript type check (0 errors)
npm run typecheck

# Run real empirical multi-run benchmark harness
python scripts/run_real_benchmarks.py

# Compile standalone sidecar binary
python scripts/build_sidecar_executable.py

# Build production bundles
npm run build

# Package standalone Windows desktop app
npx electron-builder --dir
```

Output binary: `release\win-unpacked\AniScribe.exe`.

---

## License

MIT License. Whisper models are licensed under Apache-2.0 / MIT; Silero VAD is licensed under MIT.
