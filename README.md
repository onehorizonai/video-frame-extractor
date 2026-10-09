# Video frame extractor

A free, browser-local utility by [One Horizon](https://onehorizon.ai/?utm_source=github&utm_medium=referral&utm_campaign=gtm_tools&utm_content=video-frame-extractor). Select a local video, request evenly spaced stills or a time interval, review the result, and download PNGs or a ZIP of selected frames. No account, watermark, processing server, analytics, or video upload is used.

## Run locally

Requires Node 24 or newer. Run `npm ci`, then `npm run dev` and open the printed local URL. `npm run build` creates a static site in `dist/`; deploy those files to a static host. `npm test` checks the sampling and archive rules.

For a browser smoke check, run the dev server and set `VIDEO_FIXTURE` to a local browser-playable clip, then run `npm run smoke`. This optional check uses an installed Chrome, verifies capture, PNG/preview byte identity, selected ZIP contents, malformed file handling, and that the page only requests its local assets. It saves screenshots when `ONE_WORKER_ARTIFACTS_DIR` is set.

## Embedding

The reusable browser core is exported at `@onehorizon/video-frame-extractor`; the React interface is exported at `@onehorizon/video-frame-extractor/react` and its styles at `@onehorizon/video-frame-extractor/style.css`. A website using this repository as a workspace package can import the component and CSS on a client-rendered page. The core exports `sampleTimes`, `VideoSession`, `makeZip`, timestamp formatting, and limits. It has no dependency on a marketing site or server API. This repository's root Vite app is a working static example.

## Sampling and limits

- **Even count:** for `N` frames over `[start, end]`, request `start + (i + 0.5) × (end - start) / N` for `i = 0…N−1`. One frame uses the range midpoint.
- **Interval:** request `start + k × interval` while the time is strictly before `end`.
- The range must satisfy `0 ≤ start < end ≤ duration`; the app never requests the exact end of the video. Frame filenames include sequence and requested milliseconds, so repeated timestamps remain distinct.
- The browser may decode a nearby frame. The displayed **decoded** timestamp comes from `requestVideoFrameCallback` when it fires after the seek; otherwise it says **Unavailable**. A repeat of any earlier reported decoded time is flagged. This is not frame-exact extraction.
- Input guardrails: 2 GiB file, 4096 × 4096 source pixels, 30 frames. Output is scaled to fit within a 1920-pixel side and 1920 × 1080 total pixels. The estimated uncompressed batch is capped at 256 MiB; retained PNGs at 128 MiB; selected ZIP input at 64 MiB. These are conservative browser-memory guardrails, not a claim of measured support on every device. PNGs are encoded once, and previews and exports use the same blobs. ZIP stores PNGs without recompressing them.
- A single object URL backs the video; one video element, canvas, and PNG encoding are used serially. Cancellation stops between frames and during ZIP streaming. Replacing, removing, or closing the page revokes preview and video object URLs and drops retained blobs. No local storage is used.

## Format and browser support

Browser decoding decides whether a file works; the extension alone is insufficient. Unsupported or unseekable media, unknown duration, malformed data, and limit failures produce a message near the controls. Audio is ignored. Video orientation and variable frame timing follow the browser's presentation and seek behavior; this tool does not rewrite rotation metadata or force exact frame boundaries.

| Browser and media | Status |
| --- | --- |
| Chrome 154 on Windows, H.264/AAC MP4 sample | Browser smoke passed: metadata, three distinct PNG previews, individual PNG bytes, selected ZIP contents, malformed input, and local request trace. Decoded time was unavailable after paused seeks. |
| Firefox, Safari, mobile browsers, WebM, HEVC, rotated or variable-frame-rate clips | Not verified in this repository. Check the target browser and media before relying on output. |

The [MDN CC0 flower video](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4) was the Chrome smoke sample. It is not bundled with the project. The format matrix should be expanded with real devices and clips before claiming wider compatibility.

## License and dependencies

The project is MIT licensed. [fflate](https://github.com/101arrowz/fflate) is MIT licensed and creates local ZIP archives. React, React DOM, Vite, TypeScript, Playwright, and their type packages are development or interface dependencies; no fonts, codecs, or videos are bundled. See the lockfile for exact versions.

The source and static app are ready for review. A public One Horizon repository and a stable One Horizon domain route need to be connected during publication; this checkout does not configure deployment credentials or a remote.
