# UseSuno MV Studio

UseSuno MV Studio is a browser-based lyric video studio: import audio, edit lyrics and their timing, choose animations and backgrounds, then preview and export a video with audio. You can also clear the lyrics to create a pure music background video.

[UseSuno MV Studio](https://usesuno.com) is part of [UseSuno](https://usesuno.com).

Audio, lyrics, and project assets are processed locally, and projects are saved in your browser. Online fonts and self-hosted website analytics may produce network requests; see the privacy notes below.

## Features

- **14 animations**: Fume, Classic, Cadenza, Partita, Tilt, Claddagh, Monet, Cappella, Diorama, Aurora Traverse, Pendolo, Tempera, Sonnet, and Still. Includes Folia-derived templates and Studio's word-level 3D Aurora Traverse.
- **4 backgrounds**: Theme space, Fluid light, Aurora nebula, and Aurora curtain, freely combined with animations.
- **Lyrics editing**: paste text, import LRC/TXT, or read embedded lyrics from the audio; edit, split, merge, delete, clear, and undo line by line. A dedicated timing workspace supports word-level tapping, global offset, and phrase layout.
- **Framing settings**: 16:9, 9:16, and 1:1, fonts and typography, color mood, audio response, and an automatic intro that can be turned off in the settings panel. Supports online and local fonts.
- **Video export**: 720p / 1080p at 30 fps, MP4 or WebM, for the full song or a selected range; frame-by-frame export and real-time recording.
- **Local projects**: autosave and restore, undo and redo, download a `.lyricmv` project package or export LRC alone.
- **11 interface languages**: English, Simplified Chinese, Traditional Chinese, Indonesian, Hindi, Brazilian Portuguese, Filipino, German, Urdu, Russian, and Vietnamese.

The demo audio is generated programmatically and the demo lyrics are original, covering Chinese, English, Japanese, Korean, Indonesian, German, and Spanish. Unmodified legacy demo lyrics are upgraded to the multilingual version; lyrics you have edited are kept.

## Running locally

The project uses React, TypeScript, and Vite, and has been built on Node.js 22. Python 3 is required for the upstream source verification script.

```bash
npm ci
npm run dev
```

The dev server defaults to `http://127.0.0.1:5173`; if the port is taken, Vite prints the actual address.

```bash
npm test         # Unit tests
npm run build    # Type check, production build, and matching source package into dist/
npm run preview  # Preview the production build locally
```

The repository already contains the required Folia source snapshot, so no extra Folia clone is needed on first run. Video capabilities depend on the browser, system encoders, and device: frame-by-frame export relies on WebCodecs, and real-time recording relies on MediaRecorder; recording for some templates also requires tab capture. The export dialog detects encoders and required capabilities. Serve production builds over HTTPS.

## Workflow

1. Import local audio, or use the built-in demo.
2. Import, paste, or read lyrics, and check the timing as needed. Without lyrics, click **Clear lyrics** in the lyrics panel; this action can be undone.
3. Choose the animation, background, and aspect ratio, then adjust fonts, typography, and the intro.
4. Open the export dialog, set the format, resolution, and time range, and choose frame-by-frame export or real-time recording.
5. Preview and download the video when the export finishes. To keep editing or move to another device, save a `.lyricmv` project package.

Clearing lyrics removes the original lyrics and their timing, and cleans up leftover lyric visuals in templates; backgrounds and audio can still be exported. In templates that show lyrics, the waiting placeholder is uniformly `...` before the first line starts.

Browser storage is not a permanent backup: clearing site data, using private windows, or the browser reclaiming storage can cause data loss. Project packages can include audio and local fonts; confirm the required assets are packaged before moving across devices. Exported videos are kept only for the current page session — download them before closing or refreshing.

## Export methods

### Frame-by-frame export

The animation advances at fixed timestamps and the video is encoded without waiting for the audio to play through. All 14 templates provide a frame-by-frame path, but processing time depends on the template, background, font, resolution, and device. **It is not guaranteed to be faster than real time, nor uniform across templates.**

There is no hardcoded song length limit. Long videos are still constrained by practical limits such as available memory, browser encoders, and file size. The end time shows at most two decimal places; a default full-song export keeps the audio's original precise duration.

Frame-by-frame export pauses when you switch tabs or minimize the window, keeping its progress, and resumes when you return. Closing, refreshing, or leaving the page interrupts the task and cannot be resumed across pages.

### Frame capture options

These options appear only in the frame-by-frame export of Folia templates. Names are translated into the interface language, and the available options vary by template, background, and browser capability.

| Method | Applies to | Description |
| --- | --- | --- |
| Standard capture | All Folia templates | The default; captures the original web animation. |
| Layered capture (experimental) | All Folia templates can try it | Grabs the original canvases and the text layer separately, handing composition and encoding to a separate thread that overlaps with the next frame capture. Unsupported scenes fall back to the standard method. |
| Browser-native capture (experimental) | Requires a browser experiment | Uses HTML-in-Canvas to capture the existing DOM; falls back to the standard method when unavailable or on failure. |
| Direct canvas capture (experimental) | Fume with Fluid light only | Composites the original canvases directly, skipping the DOM screenshot. |
| Parallel canvas rendering (experimental) | Fume with Fluid light only | Uses the drawing core shared with the preview to render lyrics, composite, and encode in a separate thread. |

Most combinations therefore show **3 methods**, and Fume with Fluid light shows **5**. The separate-thread options require Worker and OffscreenCanvas support. Native capture requires a compatible Chromium browser with `chrome://flags/#canvas-draw-element` enabled and a restart; an option being offered does not mean the browser already supports the API.

Experimental paths keep the original resolution, frame rate, and bitrate, but may show subtle color or text rasterization differences — verify against the preview. Layered capture temporarily hides the editor preview and restores it when the export ends or is canceled. The separate thread does not replace all main-thread work, and switching tabs still pauses. Parallel canvas rendering verifies font measurements; on mismatch it stops and suggests direct capture instead of silently substituting fonts.

Entry points: [src/export/foliaFrames.ts](src/export/foliaFrames.ts), [src/folia/layeredCapture.ts](src/folia/layeredCapture.ts), and [src/export/fumeRender.worker.ts](src/export/fumeRender.worker.ts).

### Real-time recording

Plays and records the selected range in real time, usually requiring a wait close to the clip length. During recording the stage stays sharp while the surrounding interface is blurred; the area below shows status, recorded time, total duration, progress, and a cancel button. These controls sit outside the recorded region.

Some Folia combinations require the browser to authorize sharing the current Studio tab, cropped to the stage via region capture; the app builds the soundtrack from the imported audio and never requests the microphone. Choose the current tab when the browser prompts you.

**Real-time recording requires the page to stay visible.** Switching tabs, minimizing the window, or stopping the share ends the recording and you must start over. Unlike frame-by-frame export, there is no pause-and-resume.

## Environment configuration and privacy

Local development and open-source builds need no analytics configuration. To keep a private deployment setup, copy the example file:

```bash
cp .env.example .env
```

`.env.example` ships with empty values only. `.env`, other environment variants, and `.private/` are excluded from Git and the public source package. **The public source contains no GA loader code or actual measurement IDs**; a plain `npm run build` does not inject analytics. A production site that wants analytics should inject them in a separate, uncommitted private deployment step — real credentials must not be written back into the source or docs.

Audio, lyrics, and project assets are never uploaded to a server. The online font picker reaches the GitHub font catalog and Google Fonts; font preview requests may carry the font name but never your lyrics or audio. See [public/privacy.html](public/privacy.html) for details.

Build artifacts, exported videos, temporary QA pages, test reports, logs, and local environment files are covered by [.gitignore](.gitignore). Source code, formal tests, lockfiles, licenses, build scripts, and Folia patches belong in version control.

## Project structure

```text
src/
  App.tsx               Workspace and asset import
  components/           Editor, export dialog, and recording status UI
  timestamp/            Word-level timing and phrase layout
  folia/                Folia iframe adapter, intro, and frame capture
  export/               Frame encoding, real-time recording, worker messaging, and progress
  aurora/               Studio aurora background
  vendor/folia/         Folia source snapshot and MANIFEST.json
  audio/ import/        Audio analysis and lyrics parsing
  domain/ persistence/  Project model, history, and local storage
  renderer/             Legacy canvas renderer
scripts/
  compliance.ts         Source package and dependency notice generation
  vendor-folia.py       Upstream snapshot and patch verification
  folia-patches/        Replayable Studio changes on top of upstream
public/                 Icons, privacy, and license pages
tests/                  Unit tests
```

## Build and deployment

Deploy the complete `dist/` to a static hosting service, keeping the multi-page entries `index.html`, `timestamp.html`, `folia.html`, `privacy.html`, and `licenses.html`. Do not upload only the HTML/JS, and do not rewrite all requests to the home page.

The build also generates `/source/verse-studio-source.zip` and the licenses, dependency versions, and source links under `/legal/`. The About window and license pages provide access. The source package uses an allowlist covering current app source, build scripts, tests, lockfiles, manifests, and the resources listed by the upstream manifest, with a SHA-256 manifest attached; it excludes Git history, install directories, private configuration, user assets, and browser data. If the source changes during the build, the build fails.

Run before releasing:

```bash
npm test
python3 scripts/vendor-folia.py --check
npm run build
git diff --check
```

These checks validate code, patches, and build artifacts; they do not replace acceptance on real songs for visuals, audio sync, cancel and resume, and browser compatibility. Experimental capture options are off by default, and narrow benchmark results must not be presented as speed promises on all devices.

## Updating Folia

The current snapshot and upstream commit are recorded in [MANIFEST.json](src/vendor/folia/MANIFEST.json). Verify against a clean upstream checkout matching that commit:

```bash
python3 scripts/vendor-folia.py --source ../folia-major --check
```

After modifying vendored files, review the diff, then record and verify the patches:

```bash
python3 scripts/vendor-folia.py --record-patches
python3 scripts/vendor-folia.py --check
npm test
```

Routine syncs replay the patches in `scripts/folia-patches/` and never silently overwrite unrecorded changes. Upgrading the upstream commit requires a separate review of the source manifest, dependencies, and patch conflicts — do not just update hashes to bypass verification.

## License and acknowledgments

This project is released under **AGPL-3.0-only**; see [LICENSE](LICENSE) for the full terms. Copyright (C) 2026 UseSuno.

The app includes derivative source code from [Folia](https://github.com/chthollyphile/folia-major); per-file provenance and hashes are recorded in the upstream manifest. Third-party code, assets, and dependencies are described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the `legal/dependency-notices.txt` generated at build time. When deploying or redistributing, keep the applicable licenses, notices, and corresponding-source entry points.

Google Fonts are subject to their own licenses; before importing or bundling local fonts, audio, images, or lyrics, confirm you have the rights to use and distribute them. A software license does not grant rights to third-party material.
