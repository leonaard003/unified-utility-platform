# Unified Utility Platform PRD

**Project:** Unified utility web app for transcript, downloader, converter, signature, and paper/printing calculator
**Owner:** Onichan
**Date:** 2026-08-26
**Status:** Draft PRD v1
**Authoring mode:** Generated via Claude Code, then saved locally by Hermes

---

## Product Summary

A single web application consolidating five practical utilities:
- YouTube transcript extraction
- Social media/video downloading
- File format conversion
- Online signature creation
- Paper/printing calculations

The product should act as one modular utility hub so users do not need to jump between separate services. The initial build is **functionality-first**: working flows, useful outputs, and maintainable module boundaries matter more than polished design. Styling, layout refinement, and branding will be iterated later by the owner.

---

## Problem / Opportunity

- Users currently rely on fragmented tools for transcripts, downloads, conversions, signatures, and printing calculations.
- Switching between multiple sites creates friction, inconsistent UX, and slower workflows.
- Some workflows chain naturally together, such as downloading media then converting it, or generating assets then using them in other modules.
- There is an opportunity to build one expandable utility platform that starts simple and can grow into a durable product asset.

---

## Goals

- Build a working multi-tool web app with clear utility from day one.
- Prioritize function, content, and reliable outputs over design polish.
- Keep each tool independently usable while sharing one overall platform shell.
- Use a modular architecture so new tools can be added later.
- Make deployment realistic on infrastructure the owner controls, especially Hostinger VPS.

---

## Non-Goals

- Perfect branding or final visual design in v1
- User accounts, login, or profile systems in v1
- Saved history, collaboration, or team features in v1
- Billing, subscriptions, or premium plans in v1
- SEO-heavy content strategy in v1
- Enterprise workflow orchestration in v1

---

## Target Users

### Primary user
- The owner/admin who wants one reusable platform containing several practical tools.

### Secondary users
- General web users who need:
  - transcript extraction
  - social media downloads
  - common file conversion
  - quick signature export
  - printing/paper calculations

---

## Information Architecture / Routes

```text
/
├── /tools/transcript
├── /tools/downloader
├── /tools/converter
├── /tools/signature
├── /tools/paper-calculator
└── /about
```

### Route behavior
- `/` = simple landing/dashboard listing all tools with short descriptions
- `/tools/transcript` = YouTube transcript tool
- `/tools/downloader` = social/video downloader
- `/tools/converter` = file converter hub
- `/tools/signature` = signature creation/export tool
- `/tools/paper-calculator` = paper and printing calculator
- `/about` = basic explanation/disclaimer/help page

---

## Functional Requirements by Module

## 1. YouTube Transcript Generator

### Purpose
Allow users to paste a YouTube URL or video ID and retrieve transcript text quickly.

### Inputs
- YouTube URL
- Raw video ID
- Optional language selection if multiple caption tracks exist

### Core processing
- Validate URL/video ID
- Extract video ID
- Fetch available transcript/caption data
- Normalize transcript into structured segments

### Outputs
- Display transcript in-browser
- Download transcript as `.txt`
- Download transcript as `.srt`
- Copy transcript text
- Optional timestamp display toggle

### Must-have requirements
- Support common YouTube URL formats
- Show clear loading state
- Handle transcript-unavailable cases cleanly
- Handle invalid, private, or unreachable videos

### Nice-to-have
- Download transcript as `.json`
- Show video title/thumbnail
- Multi-language fallback

### No-go features for v1
- User transcript history
- Annotation/editing system
- Team sharing

---

## 2. Social / Video Downloader

### Purpose
Allow users to download media from supported social/video platforms from one interface.

### Target platforms
- YouTube
- X / Twitter
- Instagram
- TikTok

### Inputs
- One supported URL at a time for MVP

### Common processing
- Detect platform from URL
- Validate source link
- Fetch media metadata when available
- Offer available formats/qualities
- Generate downloadable result

### Common outputs
- Direct browser download
- File naming in predictable format
- Clear errors when media is unavailable or blocked

### Per-platform requirements

#### YouTube
- Accept single video URLs
- Download video+audio when available
- Allow audio-only mode
- Offer format/resolution choices where available

#### X / Twitter
- Accept tweet URLs containing media
- Download media as MP4 when supported
- Handle GIF-like media as downloadable video output

#### Instagram
- Accept post/reel URLs
- Download video or image content when supported
- For carousel posts, either download individually or bundle if feasible later

#### TikTok
- Accept single video URLs
- Download video output when supported
- Keep MVP simple; do not promise advanced watermark handling

### Must-have requirements
- URL paste field
- Platform detection
- Download action
- User-facing progress/loading state
- Error handling for unsupported or broken URLs

### Nice-to-have
- Audio-only extraction
- Better metadata preview
- ZIP output for multi-asset sources

### Important constraints
- Source platforms may change behavior and break extraction
- Must include clear legal disclaimer
- Availability depends on source platform restrictions

### No-go features for v1
- Bulk playlist downloads
- Aggressive bypass/watermark-removal promises
- Long-term download history

---

## 3. Practical File Converter

### Purpose
Provide useful common format conversions without trying to clone the full breadth of CloudConvert in v1.

### MVP conversion scope

#### Documents
- PDF -> TXT
- DOCX -> PDF
- DOCX -> TXT
- JPG/PNG -> PDF

#### Images
- JPG <-> PNG
- WEBP -> JPG/PNG
- Resize image
- Compress image quality

#### Audio
- MP3 <-> WAV
- MP3 <-> M4A
- MP3 <-> OGG

#### Video
- MP4 <-> WebM
- MOV -> MP4
- Basic resolution selection for supported cases

### Inputs
- File upload
- Output format selection
- Optional format-specific options

### Outputs
- Download converted file
- Preview where practical (especially for images)
- Clear unsupported-format or failed-conversion messages

### Must-have requirements
- Upload file
- Detect file type
- Choose output format
- Run conversion
- Download result
- Show progress/error state

### Nice-to-have
- Better compression presets
- More image/video options
- Small conversion presets for common cases

### Constraints
- Start narrow and practical
- Avoid promising 200+ formats in MVP
- Set file size limits

### No-go features for v1
- Massive format catalog
- Full batch conversion system
- Deep codec tuning

---

## 4. Online Signature Tool

### Purpose
Allow users to create a simple signature asset for reuse in documents.

### Input modes
- Draw signature on canvas
- Type signature text
- Optional upload of existing signature image

### Core processing
- Render drawn or typed signature
- Clean/export signature image
- Support transparent background output

### Outputs
- PNG with transparent background
- PNG with white background
- Optional SVG for drawn signatures if feasible
- Preview before download

### Must-have requirements
- Draw mode
- Clear/retry action
- Typed mode
- Export/download as PNG

### Nice-to-have
- Font selection for typed signature
- Pen thickness/color options
- Auto-trim empty whitespace
- SVG export

### No-go features for v1
- Legal notarization claims
- Built-in PDF signing workflow
- Identity verification systems

---

## 5. Paper / Printing Calculator

### Purpose
Help with print-related area, fit, quantity, and simple cost calculations.

### Sub-modules
- Paper calculator
- Printing calculator

### Paper calculator inputs
- Width and height
- Unit selection (mm/cm/inch/m)
- Quantity
- Paper type / preset sizes (A-series, Letter, custom)
- Optional price per sheet/ream/kg

### Paper calculator outputs
- Calculated area
- Per-sheet area
- Total area for quantity
- Sheet/ream conversions
- Optional weight/cost estimates

### Printing calculator inputs
- Page/sheet count
- Color or black-and-white
- Paper type
- Binding/finishing option if needed
- Quantity / run size
- Base unit costs

### Printing calculator outputs
- Total cost
- Cost per unit
- Cost breakdown
- Piece-fit calculation where relevant
- Simple result summary that can be copied

### Must-have requirements
- Area calculation
- Unit conversion
- Piece-fit calculation
- Result summary

### Nice-to-have
- A3/A4/A5 templates
- Orientation auto-check
- Waste estimation
- Simple print quote summary

### No-go features for v1
- Supplier integrations
- Real-time material pricing
- Full accounting/tax engine

---

## Cross-Module Requirements

### Functional
- Every tool has its own dedicated page
- Shared top-level navigation and platform shell
- Responsive enough for desktop and mobile
- Straightforward output downloads
- Friendly empty, loading, success, and error states

### Operational
- Temporary uploaded/generated files must auto-expire
- Server-side validation for uploads and URLs
- File size caps per tool
- Basic rate limiting on heavy endpoints
- Error logging for debugging

### Product behavior
- No login required in v1
- No user account system in v1
- No persistent user history in v1
- Prefer client-side processing where practical, fallback to server-side where necessary

### Accessibility baseline
- Semantic HTML
- Label every form input
- Visible focus states
- Keyboard-accessible core actions
- Plain-language error messages

### Browser support
- Latest major Chrome, Firefox, Safari, Edge
- Reasonable mobile browser usability

---

## MVP Phases

### Phase 1
- Shared app shell
- YouTube Transcript Tool
- Social Video Downloader
- Basic File Converter

### Phase 2
- Online Signature Tool
- Paper / Printing Calculator

### Phase 3
- Better admin/debug visibility
- Expanded converter formats
- More downloader options
- Optional history/auth later if product direction requires it
- SEO landing pages per tool later

### Why this order
- Transcript and downloader are closest to the original product intent
- Converter adds broad practical value
- Signature and paper calculator are valuable but can follow after the platform shell is stable

---

## Acceptance Criteria

### Platform-level acceptance
- User can open the app and navigate to each tool page
- At least the Phase 1 modules work end-to-end
- Errors are handled clearly without crashes
- Output files download successfully

### Transcript acceptance
- Valid YouTube URL returns transcript when captions are available
- Transcript can be copied and downloaded
- Invalid/unavailable videos show clear errors

### Downloader acceptance
- Supported URLs from target platforms can be processed when media is available
- User can download at least one real file per priority platform in supported cases
- UI does not promise unsupported formats/features

### Converter acceptance
- MVP conversion pairs work end-to-end
- Failed/unsupported formats show useful errors
- Converted files are downloadable and valid

### Signature acceptance
- User can draw or type signature and export PNG
- Clear/retry works reliably

### Paper calculator acceptance
- Area/unit calculations are correct
- Piece-fit output is understandable
- Results can be copied and reused easily

---

## Technical Direction

### Recommended architecture
- **Frontend:** Next.js app
- **Backend/API:** Next.js route handlers or lightweight companion API
- **Heavy processing:** separate worker/service for downloader and some conversions where needed
- **Storage:** temporary local storage first, object storage later only if needed

### Why this approach
- One app can host all modules cleanly
- Heavy tasks stay isolated from the UI layer
- Easier to expand module by module
- Better fit for a utility platform than a one-off single-purpose prototype

### Practical MVP structure
- One web app for UI and simple APIs
- Optional Python/worker service for yt-dlp/ffmpeg-backed operations
- Shared utility layer for validation, temp files, download responses, and cleanup

---

## Deployment Considerations

## Can this be deployed on Hostinger?

**Yes — preferably on Hostinger VPS.**

### Good fit: Hostinger VPS
Use VPS if the app needs:
- ffmpeg
- yt-dlp
- server-side file conversion
- background jobs / worker processes
- temp file storage
- more control over runtime and dependencies

### Risky / limited: Shared hosting
Shared hosting is not ideal if you need:
- custom binaries
- Python worker services
- heavy file processing
- downloader backends
- larger uploads/conversions

### Deployment recommendation
Best options:
1. **Hostinger VPS** for full all-in-one deployment
2. **Hybrid split**:
   - frontend on Vercel/static host
   - heavy downloader/conversion worker on VPS
3. **Single VPS deployment** if you want one controlled server only

### Recommended practical path
If you want everything under Hostinger, use **Hostinger VPS**, not standard shared hosting.

---

## Legal / Risk Notes

### Downloader risks
- Downloading social/video content may conflict with platform terms or copyright rules
- Must include visible disclaimer
- User is responsible for lawful usage
- Some platforms may throttle, block, or break extraction at any time

### File conversion risks
- Uploaded files may be sensitive
- Temporary files must be cleaned up automatically
- Privacy note should explain retention/deletion clearly

### Signature tool risks
- Must not imply universal legal validity
- Signature export is a utility feature, not legal certification

### General product risk
- Source platform/API behavior can change
- Heavy processing can strain cheap infrastructure
- Broad scope can cause MVP bloat if module boundaries are not enforced

---

## Open Questions

1. Is the app public-facing, internal-only, or both?
2. Which exact conversion pairs are most important for the first MVP?
3. For the printing calculator, which real-world formulas/workflows matter most in your business?
4. Do you want stateless downloads only, or future admin-only history later?
5. Do you want transcript timestamps on by default or optional?
6. Will deployment definitely use Hostinger VPS?

---

## Recommended Build Order

1. Create shared app shell and routing
2. Build transcript module
3. Build downloader module
4. Build limited converter module
5. Add temp-file cleanup, validation, and rate limiting
6. Build signature module
7. Build paper/printing calculator
8. Improve styling and branding after function is stable

---

## Final Recommendation

Treat this product as a **unified modular utility platform**.

Launch the first working version with:
- Transcript
- Downloader
- Converter

Then expand with:
- Signature
- Paper / Printing Calculator

This keeps the first release practical, reduces scope explosion, and still preserves the long-term vision of one expandable utility hub.
