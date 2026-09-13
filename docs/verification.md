# Verification — 2026-09-13

## Passed

| Check | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Unit tests | 8 passed |
| Electron desktop scenarios | 6 passed |
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

## Performance sample

Hardware detected: NVIDIA GeForce RTX 5080, 16 GB VRAM.

The 500-image test uses distinct 512×768 synthetic color images on a board at 22% zoom. During a 100-step native pointer pan, 262 measured animation-frame intervals had a **4.2 ms median and 12.6 ms 95th percentile**. These intervals meet the approximate 60 FPS interaction target in this fixture. See `benchmark.json` for the raw summary.

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
