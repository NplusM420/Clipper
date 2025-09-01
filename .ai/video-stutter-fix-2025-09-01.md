# Video Stutter/Lag – Root Cause and Fixes (2025-09-01)

## Symptoms
- Playback appears to drop frames and stutter, especially when the UI updates alongside video playback.

## Root Causes
1) Excessive React re-renders from `onTimeUpdate`
- The video was emitting time updates every frame (~60fps), and that propagated into `Dashboard` and `TranscriptPanel`, causing frequent reconciling and scroll operations.

2) Insufficient buffering and suboptimal delivery URLs
- Chunked playback preloaded with `metadata`, which minimized effective buffering.
- Cloudinary URLs forced `.mp4`, missing CDN-side `f_auto`/`q_auto` optimizations.

3) Transcript auto-scroll on every time tick
- Auto-scroll executed on every `currentTime` change without throttling.

## Fixes Implemented
- Throttled time updates to 5 Hz and reduced UI churn:
  - `client/src/components/ChunkedVideoPlayer.tsx`: emit `onTimeUpdate` at most every 200ms.
  - `client/src/pages/Dashboard.tsx`: quantize `currentTime` passed to `TranscriptPanel` to 0.2s.
  - `client/src/components/TranscriptPanel.tsx`: `React.memo` + throttled auto-scroll (300ms).

- Improved buffering and delivery:
  - `ChunkedVideoPlayer` and preloader now use `preload="auto"`.
  - Client `VideoChunkingService.getPartUrl` uses Cloudinary `f_auto,q_auto:good` (no hard `.mp4`).
  - Added `playsInline` and proper `crossOrigin` for better streaming behavior.

## Files Changed
- `client/src/components/ChunkedVideoPlayer.tsx`
  - Throttle `onTimeUpdate` and enhance `<video>` attributes for buffering.
- `client/src/components/TranscriptPanel.tsx`
  - Wrap in `React.memo` + throttle auto-scroll.
- `client/src/services/videoChunkingService.ts`
  - Use `f_auto,q_auto:good` URL; set preloader to `preload='auto'`.
- `client/src/pages/Dashboard.tsx`
  - Quantize `currentTime` for transcript to cut UI work.

## Validation
- Typecheck and build succeed.
- Expect meaningfully smoother playback and fewer UI-induced stalls.

## Next Steps (optional)
- Add FPS overlay to measure frame cadence during playback.
- Consider `requestVideoFrameCallback` (with feature detection) to schedule UI updates.
- For chunked transitions, prefetch next part earlier and fade seamlessly between parts.
