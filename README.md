# Unified Utility Platform

Functionality-first MVP for a single web app that groups:
- YouTube transcript
- social/video downloader
- file converter
- online signature
- paper/printing calculator

## What is real in this build

- **Transcript:** live multi-platform video transcription for public YouTube, Instagram, TikTok, and X/Twitter URLs by downloading media, extracting audio, and transcribing it locally with faster-whisper; demo mode remains available for UI testing.
- **Downloader:** real platform detection and capability disclosure; actual downloads work only when `yt-dlp` is installed. In this environment, that dependency may be missing.
- **Converter:** real image conversion, PDF text extraction, DOCX text/HTML/PDF fallback conversion, and ffmpeg-backed audio/video conversion when `ffmpeg` is installed.
- **Signature:** real in-browser drawing/typing and PNG export.
- **Paper calculator:** real area, fit, and simple cost math.

## Stack

- Next.js 15 + TypeScript
- Bundled libs: `sharp`, `pdf-lib`, `mammoth`, `unpdf`
- Optional native deps: `ffmpeg`, `yt-dlp`, `LibreOffice`
- Python STT runtime: `faster-whisper`

## Project location

```bash
/opt/data/unified-utility-platform
```

## Run locally

```bash
cd /opt/data/unified-utility-platform
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Production build

```bash
npm run build
YTDLP_PATH=/opt/data/home/.local/bin/yt-dlp npm start
```

## Docker / VPS deployment

The project now includes:
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `DEPLOY_HOSTINGER.md`

Default Traefik host in the compose file:

```text
tools.aviroam.com
```

The compose file also publishes the app directly on:

```text
http://SERVER_IP:3100
```

This is the fastest fallback when Traefik/domain routing is not ready yet.

For Hostinger VPS + Docker Manager, follow `DEPLOY_HOSTINGER.md`.


## Optional dependencies

### yt-dlp
Needed for downloader probing/downloading and for live video-transcript source fetching.

Example install options:

```bash
uv tool install yt-dlp
# or
python3 -m pip install --user yt-dlp
```

### ffmpeg
Needed for audio/video conversion and higher-quality downloader workflows.

```bash
sudo apt install ffmpeg
```

### LibreOffice
Needed only for higher-fidelity DOCX -> PDF conversion.

```bash
sudo apt install libreoffice-writer
```

## Notes

- No accounts or saved history in this MVP.
- Uploaded/generated files are temporary.
- Downloader behavior depends on upstream platform restrictions.
- Signature export is a utility feature, not a legal-certification feature.
