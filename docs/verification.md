# Version 0.3.5 - 2026-09-20

GitHub release preparation: all 41 unit tests and all 18 Electron desktop scenarios passed in one full run. The browser integration check passed against the real hidden Electron backend, covering project creation, saving/reopening, binary image import, image serving, recent projects, and RPC errors. TypeScript checking and the production build passed.

Built a fresh Windows x64 NSIS installer, `Local Imagine Workspace Setup 0.3.5.exe`. The packaged executable passed `node scripts/smoke.mjs`, including native SQLite/Sharp, text editing, context actions, recent projects, sensitive-item screenshot masking, themes, item colors, and rigid group movement. Windows reports the installer as unsigned. The installer was not installed into the user's account; the packaged payload was launched directly. SHA-256: `1c335cfd9cbd67e217fee92119121b5d3bfb54cef95fa27502f332dcd3780fa6`.

The README includes four user-supplied screenshots with descriptions of board organization, local generation setup, grouped character variants, and image actions. Those example images are documentation, not generation-test evidence. Real ComfyUI inference and authenticated Codex imagegen remain unverified as described below.

# Version 0.3.4 - 2026-09-15

Rigid group positioning: 41 unit tests passed. All 18 desktop scenarios passed across the regression run and the focused rerun of snapping and grouped movement. The regression exposed guides being cleared by non-position canvas updates; the fix passed the rerun. New coverage verifies dragging nested members, multi-member selection, unchanged local offsets, grid snapping, undo/redo and reopening. Unit checks cover deduplication and locked sibling protection. Alignment and Codex move commands use the same outermost-group motion unit.

Built the unsigned Windows x64 installer and passed the packaged smoke check, including dragging a grouped sensitive member and verifying that only the group position changes. Existing groups gain this behavior without a schema change. Ungroup to independently resize or reposition members. Existing browser-mode and other working-tree changes remain preserved.

# Version 0.3.3 - 2026-09-15

Full app palettes and per-item overrides: 39 unit tests and all 17 desktop scenarios passed. New checks cover palette completeness and validation, legacy preferences, opaque item colors, selection isolation, locked selections, reset, persistence, undo, independent theme changes, and computed UI colors. The spoiler clipboard pixel test, existing harness/recovery tests, and 500-card benchmark also passed.

Built the unsigned Windows x64 installer. Packaged smoke passed, including Paper light with light native form controls and a custom opaque sensitive-cover color. Dark and light screenshots were visually inspected. Theme settings stay in local app preferences; item overrides stay in the project and do not change original image pixels. Native operating-system dialogs follow Windows settings. Pre-existing browser-mode changes remain intact and uncommitted with the working tree.

# Version 0.3.2 - 2026-09-15

Sensitive canvas placements: all 37 unit tests and 16 desktop scenarios passed. Coverage includes inherited group masking, selection availability, marking undo/redo and reload persistence, and a native clipboard pixel assertion proving a revealed sensitive image is opaque in the safe screenshot. The full canvas, Codex, fake-ComfyUI, recovery, and 500-card regression suite passed.

Built the unsigned Windows x64 installer and passed the packaged smoke test including sensitive text marking and safe screenshot capture. The first smoke attempt selected the original card underneath its duplicate; the test now targets the visible selected card. The earlier focused desktop run found overlapping capture/snapping controls; the layout was corrected before the full passing run.

Safe capture is desktop-only and includes the current canvas viewport, with other panels hidden. Browser mode supports persistent marking and manual hide/reveal. External screenshot detection is not supported. Original assets, library thumbnails, exports, and full-resolution views remain unchanged. Existing browser-mode working-tree changes were preserved. Existing real-generation acceptance limitations below still apply.

# Version 0.3.1 - 2026-09-14

Recent-project navigation: all 29 unit tests passed, including cache persistence, ordering/deduplication, bounded history, corrupt-cache recovery, unavailable folders, and removal without deleting files. Three targeted desktop scenarios passed: recent-project reopening after process restart with folder dialogs disabled, existing project relocation/writer locking, and in-flight job restart recovery. The full desktop suite was not repeated for this focused navigation change. The packaged smoke test passed on rerun; its first attempt encountered a transient duplicate text-node locator during the existing context-menu step.

# Version 0.3.0 - 2026-09-14

All 26 unit tests and 14 desktop scenarios passed. New coverage checks left-docked chat/canvas separation, Enter/Shift+Enter, streamed message bubbles, explicit image attachments, native imagegen skill input, completed-image ingestion, duplicate event suppression, output spacing, path validation and inline previews. Native image bytes in fixtures are synthetic; no online imagegen request was made.

The installed Codex provider capability/account handshake is tested with an isolated signed-out profile. Authenticated imagegen remains unverified and depends on the user's account and installed Codex. Imagegen and explicit reference attachments use OpenAI online; local ComfyUI remains available separately. Shell and external tool access remain disabled.

# Version 0.2.0 - 2026-09-14

All 25 unit tests and 13 desktop scenarios passed. New Codex coverage checks bounded tool arguments, browser sign-in routing through a simulated app-server, dynamic tool responses, duplicate call suppression, interruption, canvas edits/undo/locked items, and generation through fake ComfyUI. The actual installed Codex app-server initialization/account-read handshake passed with an isolated signed-out profile.

An authenticated live Codex conversation and real ComfyUI model inference have **not** been verified. Sign-in requires the user to complete the official browser flow. App-server dynamic tools are experimental and depend on the separately installed Codex version. The online agent transmits workspace context; manual canvas and local ComfyUI operation retain their offline boundary.

# Version 0.1.3 — 2026-09-14

Custom workspace colors: production build and 23 unit tests passed. Two targeted desktop scenarios passed: appearance live preview, local persistence, reset, unchanged board records, dialog keyboard isolation, and the existing snapping drag/undo regression. The full harness suite was not repeated for this presentation-only change. The unsigned 0.1.3 installer and packaged smoke result are recorded in the delivery files.

# Version 0.1.2 — 2026-09-14

Grid snapping and edge/center alignment guides: 23 unit tests passed. All 10 desktop scenarios passed across the regression run and a targeted rerun of the four canvas-menu scenarios. The first run caught a test loading race; the helper now waits for project controls before clicking. New coverage checks grid rounding, zoom-relative alignment thresholds, grouped world coordinates, selection spacing, drag release, undo, guide dismissal, and remembered toggles.

The unsigned Windows 0.1.2 installer was built and the packaged application smoke test passed. Snapping applies to dragging; resizing and import placement are unchanged. Existing real-inference limitations below still apply.

# Verification — 0.1.1 — 2026-09-13

## Passed

| Check | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Unit tests | 19 passed |
| Electron desktop scenarios | 9 passed |
| Packaged Windows app smoke test | Passed; see `packaged-smoke.json` |
| Dependency audit | 0 known vulnerabilities after updates |
| Windows x64 installer | Built; unsigned NSIS installer |

The desktop scenarios exercise real Electron windows, native clipboard APIs, native SQLite, Sharp thumbnail creation, and renderer interactions:

1. Text editing, undo/redo, grouping, clipboard import, resizing with preserved aspect ratio, comparison, close/reopen, project-folder relocation, and writer locking.
2. Two-image batch generation, image-to-image upload, recorded seeds, server rejection, running cancellation, lost-POST-response reconciliation, and prevention of duplicate submissions.
3. A 500-card board using 500 distinct image assets, native pointer panning, viewport culling, and blocked external renderer requests.
4. Partial output-download failure and recovery, stale board saves preserving newly ingested outputs, path containment, workflow snapshots, and explicit offline-verification records invalidated by workflow edits.
5. Drag/drop import, deletion of the matching server-pending prompt, linked retry, and refusal to interrupt another client's running prompt.
6. Application shutdown/restart with an in-flight prompt, recovery using its saved prompt ID, and no new submission.

7. Context selection rules, captured placement at non-default zoom, right-drag threshold, menu edge positioning, keyboard navigation, dismissal, and focus restoration.
8. Image clipboard pixel equality, original export byte equality, cancellation and protected paths, invalid asset IDs, Explorer invocation, multi-image comparison, and locked-item actions.
9. Import/paste placement, group rename, native editing menus, empty clipboard feedback, and generation job details/cancellation/placeholder removal.

The new unit coverage checks full-selection action eligibility, job-state actions, the 4 CSS pixel gesture threshold, and screen-to-canvas coordinate conversion. Native Save As, Explorer, and editing-menu boundaries are stubbed in desktop tests; clipboard reads and writes use Electron directly.

## Performance sample

Hardware detected: NVIDIA GeForce RTX 5080, 16 GB VRAM.

The 500-image test uses distinct 512×768 synthetic color images on a board at 22% zoom. During a 100-step native pointer pan, 268 measured animation-frame intervals had a **4.2 ms median and 12.6 ms 95th percentile**. These intervals meet the approximate 60 FPS interaction target in this fixture. See `benchmark.json` for the raw summary.

This is not a promise of those timings for every board. It does not measure complex photographic decoding, huge source images, or panning while GPU inference is running.

## Not verified

**Real SDXL generation and full-system offline inference acceptance were not run.** No ComfyUI response was available on local ports 8188 or 8001. A separate installation was found at `D:\AI\Stability Matrix\Data\Packages\ComfyUI`; it was not launched, changed, or upgraded, matching the agreed integration boundary.

The automated harness uses a local HTTP/WebSocket fixture clearly identified as simulated. It exercises submission, upload, progress/recovery contracts, output ingestion, and failures; it does not load model weights or demonstrate model quality.

External renderer requests are blocked and native service requests use loopback with redirects disabled. Arbitrary custom-node egress cannot be attested by this client. Imported workflows require a user-confirmed offline execution test; that record is explicitly labeled user-confirmed. To finish real acceptance, start an existing compatible ComfyUI separately, block its external networking while leaving loopback available, and run both bundled workflows.

The unsigned installer was built and its unpacked application was smoke-tested. The installer was not installed onto the user's Windows account during verification.

## Reproduce

```powershell
npm ci
npm test
npm run test:desktop
npm run package
node scripts/smoke.mjs
```

The test suite writes disposable projects to `.test-data/` and diagnostics to `test-results/`. The packaged smoke check writes screenshots to `docs/screenshots/`. No external image provider is used in tests.
