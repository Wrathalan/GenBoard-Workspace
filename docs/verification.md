# Weave 0.4.2 release verification — 2026-10-08

Version metadata, changelog, README, and `docs/releases/0.4.2.md` are aligned for this patch. The reference tray is anchored at the top left inside the workspace viewport, separate from board nodes, with Character, Attire, and Environment categories saved per board. It supports import/drop, copying selected images, previews, removal, Codex reference drags, keyboard tab navigation, remembered collapse state, and exclusion from safe screenshots.

All 75 unit tests, all 40 desktop scenarios, browser integration, and the packaged application smoke test passed. The new tray scenario verifies default tab order, independent category persistence across reloads, removal without changing another category, zero added canvas items, fixed viewport placement during pan, and remembered collapse state. Existing board tests explicitly collapse the overlay before interacting with cards beneath it. The tray screenshot was visually inspected; regression-generated documentation screenshots were restored.

Built `Weave.Setup.0.4.2.exe` (135,280,734 bytes), with Windows file metadata reporting 0.4.2. SHA-256: `ff58797d20bc9c909111243f128ccafa08c08252af08c8f7a00e8ffbffdc918e`. The generated `latest.yml` SHA-512 and size match the installer; its blockmap and `SHA256SUMS.txt` are present. Packaged launch, native SQLite/Sharp, persistence, canvas interactions, themes, sensitive screenshots, and clean shutdown passed; `docs/packaged-smoke.json` records those checks.

The release is prepared as a draft for separate publication. A real installed-version update and authenticated live image generation were not exercised. The installer remains unsigned; Vite retains its existing bundle-size advisory.

# Weave 0.4.1 release verification — 2026-10-07

Version metadata, changelog, usage notes, and `docs/releases/0.4.1.md` are aligned for the patch release. The source includes the GitHub updater, precise alignment/resizing, cross-board clipboard, queue recovery, on-board folders, and Send to menus.

All 75 unit tests and browser integration passed. All 39 desktop scenarios passed across the full run and a focused rerun: the full run passed 38 scenarios and exposed an ambiguous library test selector after the new canvas folder button was added; scoping it to the Project library region fixed the remaining scenario. An earlier run was interrupted after packaging regenerated files during a renderer reload; final desktop checks ran against a stable build. The optional installed-Codex check is skipped on machines without the separately installed executable, including clean CI runners.

Built the unsigned Windows x64 installer `Weave.Setup.0.4.1.exe` (135,279,682 bytes). Windows product/file metadata reports 0.4.1. SHA-256: `fe65c821ae8f6c11f7ac27ef38bea5fba6f7bd4a7e2875b4c7bb918764a4fb0d`. Its generated `latest.yml` SHA-512 and file size match, and the corresponding blockmap is present. Packaged application smoke checks passed for native SQLite/Sharp, persistence, canvas actions, theme behavior, and clean shutdown. A separate packaged updater check verified the bundled dependency, GitHub feed configuration, disabled automatic installation on quit, and native update-quit event. The archive audit found no unexpected private/development files or credential patterns in bundled application sources. Regression-generated documentation screenshots were restored.

The GitHub release is prepared as a draft; publishing is separate. Existing 0.4.0 users require a manual upgrade to receive the updater. A real installed-version upgrade, authenticated live image generation, and inference on a separate physical GPU server were not exercised. Vite retains its existing bundle-size advisory.

# GitHub top-bar updater — 2026-10-07

Added an Electron main-process updater using electron-updater 6.8.9 and the existing public GitHub repository. Installed Windows builds check after 15 seconds and every six hours; an available update appears as a compact header button, with download progress and an explicit restart action. Automatic download, installation on ordinary quit, prereleases, and downgrades are disabled. Restart saves board/style edits and blocks on pending Codex tasks, active Codex turns, and pending/running/unreconciled ComfyUI work. Browser and development transports cannot install updates. The Windows release workflow builds complete draft releases with installer, blockmap, manifest, and checksum assets.

Production build, all 75 unit tests, seven targeted Electron regressions, and browser integration passed. Updater tests cover duplicate actions, offline checks, manual installation, queue/generation restrictions, save failures, and initial state retrieval. A real electron-updater transport against a local HTTP fixture rejected corrupted bytes by checksum and successfully retried; inert fixture bytes were never executed. Normal and 900-pixel header screenshots were visually inspected. Existing board navigation and queue recovery scenarios also passed.

An unpublished NSIS test build in `.test-data/updater-package` produced `latest.yml`, `Weave.Setup.0.4.0.exe`, and its blockmap; the manifest SHA-512/size matched the installer. The packaged executable launched successfully with the bundled updater dependency and correct GitHub configuration. Its normal-quit auto-install setting is disabled, and the native updater quit event bypasses the ordinary close handshake. No real installation/upgrade or live GitHub update was performed, no release was published, and signing remains unchanged (unsigned). The test build retains the working tree's 0.4.0 version; the first public updater release must use a new version and needs a manual install by existing 0.4.0 users.

# Queue recovery replies — 2026-10-04

Distinguish automatic failure pauses from explicit Pause/Stop. An idle follow-up after a failure runs before pending tasks; a successful completion releases the failure pause. Errors during the follow-up, including an image failure inside an otherwise completed turn or a rejected submission, retain the pause. Existing board and navigation guards remain in effect, and failed tasks are not replayed.

Production build, all 64 unit tests, and two Electron queue regressions passed. Synthetic provider checks cover recovery reply priority, streaming versus completion, repeated generation failures, submission rejection, automatic resumption in queue order, preserved references, and explicit Pause/Stop. Live generation was not exercised. No installer or release was updated.

# Cross-board canvas clipboard — 2026-10-04

Added native copy/paste event handling for selected canvas items. A session token in the clipboard identifies an in-memory snapshot scoped to the project; arbitrary clipboard data cannot inject canvas structure. Pasting creates fresh IDs, preserves relative group coordinates and internal edge links, reuses image assets, retains inherited sensitive marking, and adds a single undoable change. Text inputs, Codex chat, dialogs, menus, and browser controls retain their own clipboard behavior. External image paste continues through the existing image import path.

Production build and all 64 unit tests passed. Seven targeted Electron scenarios passed, including real Ctrl+C/Ctrl+V across a board switch, source-board preservation, group and edge-link remapping, repeated pastes, undo/redo, reload persistence, native text clipboard behavior, existing image paste, and all board-navigation checks. Unit coverage also verifies copying individual children out of groups, immutable snapshots, inherited sensitive marking, and rejection of generation jobs. The earlier alignment patch remains included. No installer or GitHub release was updated for these source fixes.

# Precise alignment and resizing — 2026-10-04

Dragging now favors the joined neighbor's matching endpoints and avoids edge-to-center attraction. Resize updates apply position and dimensions together, snapping the moving edge while retaining the opposite anchor and saved image ratio. Handle direction is captured explicitly because the underlying resizer rounds DOM measurements; those rounded dimensions no longer shift saved fractional edges. Image display fills the original-ratio bounds so thumbnail pixel rounding cannot introduce a sliver of empty space.

Production build and all 61 unit tests passed. Five targeted Electron desktop scenarios passed: drag guides and undo, nested group motion, precise image resize, edge-lock movement and unlock, and Codex movement of linked items. The new mouse test verifies both corner resizing directions at 65% zoom, exact saved edges, less than 0.1 screen pixel between rendered adjoining bounds, aspect ratio, undo, reload persistence, and dragging after a resize handle is clicked without movement. The final aligned-image screenshot was visually inspected. Existing edge-linked and grouped-member resize restrictions remain in place. This is a source patch; no updated installer or release was published.

# Weave 0.4.0 release verification — 2026-10-04

The release feature set passed all 55 unit tests, all 31 Electron desktop scenarios, and browser integration. The version correction to 0.4.0 changes release metadata and documentation only; those application-code results remain applicable. The 0.4.0 production build and packaged executable smoke test verify the corrected application identity, native SQLite/Sharp, canvas editing, saved references, themes, safe capture, and sticky-edge movement. Earlier feature checks below describe the new tab strip, LAN transport, and 16-image handoff coverage.

Built the unsigned Windows x64 installer `Weave Setup 0.4.0.exe` (134,968,631 bytes). Windows product metadata reports 0.4.0. SHA-256: `03cc23a828bf3892de9f17b73d73f6d96356d94cdabbd86b9421c809e7c400aa`. The release checksum names GitHub's asset `Weave.Setup.0.4.0.exe`.

The packaged application was launched directly; installation into the user's account, authenticated live image generation, and inference on a separate physical GPU server were not tested. Regression-generated documentation screenshots were restored to their prior versions. Vite retains its existing bundle-size advisory.

# Codex image attachment handoff — 2026-10-04

References now use app-server `image` inputs with inline data URLs and `original` detail, matching the installed server's generated UserInput/ImageDetail protocol. The original PNG/JPEG/WebP bytes and selection order are preserved. Chat, character profiles, and backend validation share a 16-reference limit; duplicate asset IDs are merged before submission. The imagegen skill distinguishes current-turn attachments from filesystem paths and forbids silently dropping required references when the native tool has a lower limit.

Production build and all 55 unit tests passed. Four library/Codex desktop scenarios passed, including a synthetic RPC provider behind the real image preparation and turn-start flow: all 16 payloads matched the original bytes in order, 17 combined references retained the editable draft, removing an extra reference enabled submission, and the backend rejected overflow independently. Unit coverage also checks PNG/JPEG/WebP content detection, corrupt/missing/oversized files, no stale attachments on later text-only turns, character limits, and generated-image source IDs. Browser integration passed with overflow and invalid-reference rejection. The 16-reference composer screenshot was visually inspected.

The 16-image count comes from the official GPT Image edit API reference checked on 2026-10-04; it does not establish the signed-in Codex native tool's actual model or limit. No authenticated live generation was performed. No installer or release was produced. Vite retains its existing bundle-size advisory.

# Tabbed boards — 2026-10-04

Added scrollable header tabs with active-board highlighting, direct switching, a named-creation button, and double-click renaming. Search and previous-board navigation retain the shared navigation controller.

TypeScript and the production build passed. All six targeted board-navigation and embedded-browser desktop scenarios passed, covering tab focus and activation, long-list overflow, naming and undo history, save failures, viewport restoration, synthetic Codex busy state, and browser overlays. The 900-pixel-wide tab layout screenshot was visually inspected. Vite retains its existing bundle-size advisory. No installer was built or release published for this patch.

# LAN ComfyUI — 2026-09-27

Added explicit ComfyUI host and port selection for desktop, browser mode, and workspace-agent connections. Loopback remains the default; IPv4, IPv6, and hostnames use HTTP with redirects disabled. Reconnection retains the previous client until the new server responds successfully, and unresolved submitted jobs prevent switching to another endpoint.

TypeScript and the production build passed, along with all 54 unit tests. Four targeted desktop scenarios passed: LAN transport, existing ComfyUI batch/reference/failure/cancellation/recovery, partial ingestion and stale saves, and submitted-job restart recovery. The LAN case used a simulated ComfyUI server reached through this machine's non-loopback network-interface address; reference upload, image download, WebSocket progress, retained connections after a 503 response, endpoint persistence, restart without resubmission, and cancellation were verified. The final LAN scenario passed again after adding the explicit WebSocket progress assertion. The connection-panel screenshot was visually inspected.

Browser bridge integration passed with an explicit hostname connection and invalid-host rejection alongside existing navigation, persistence, imports, and RPC checks. No inference on a separate physical GPU server was performed. Vite retains its existing bundle-size advisory. No installer was built or release published for this patch.

# Weave 0.3.9 release verification — 2026-09-26

All 53 unit tests and all 29 Electron desktop scenarios passed in the release run. TypeScript and the production build passed, and browser integration passed board navigation/validation, atomic creation, persistence, imports, library metadata, and RPC checks. The packaged Weave 0.3.9 executable passed the smoke test, including application identity, native SQLite/Sharp, persistence, references, themes, safe capture, and sticky-edge movement.

Built the unsigned Windows x64 installer `Weave Setup 0.3.9.exe`. Windows product metadata reports Weave 0.3.9. SHA-256: `adc3fc8cd69b6f8e588a574c305c3cf14212de7a905d9bb7131c63f123421781`. The release checksum uses GitHub's normalized filename, `Weave.Setup.0.3.9.exe`.

Checked the packaged application for private profile/database files, known credential patterns, and the excluded private project name; none were found. Generated regression screenshots were restored to their previous versions. The packaged payload was launched directly; installation into the user's account, authenticated generation, and third-party website uploads were not tested. Vite retains its existing bundle-size advisory.

# Board navigation QoL — 2026-09-26

The header switcher supports project-local search, keyboard navigation, named creation, current-board renaming, and a previous-board toggle. Codex running state is available without starting the provider; switching and creation remain blocked until the turn finishes. Creation and activation share a database transaction.

Production build and all 53 unit tests passed. Desktop verification passed 27 distinct scenarios across the regression run and final targeted reruns: four board-navigation scenarios plus the existing workspace, context-menu, embedded-browser, and library/Codex queue coverage. The browser bridge integration passed the new busy-state query, name validation, atomic create/activate, switching, and persistence checks alongside its existing scenarios.

New checks cover save failures without lost edits, entered-name retention and retry, transaction rollback without leftover boards, rapid duplicate submissions, initial and live Codex busy state, undo preservation after renaming, viewport restoration, history reset across projects/reloads, search and focus behavior, 26-board list scrolling, 900-pixel layouts, and embedded-browser visibility behind the switcher and naming dialog. The final narrow-layout screenshot was visually inspected. Regression-generated documentation screenshots were restored to avoid unrelated changes.

Codex restriction tests use a synthetic running state; no authenticated generation was required. Vite retains its existing bundle-size advisory. This is an unversioned source patch; no installer or published release was produced.

# Weave 0.3.8 release verification - 2026-09-24

Built `release/Weave Setup 0.3.8.exe` with the embedded browser panel and original-image website attachments. TypeScript and the production build passed, all 53 unit tests and all 25 Electron desktop scenarios passed, and external-browser integration passed project create/save/reopen, metadata, imports, recent projects, and RPC checks. The desktop suite includes browser navigation and isolation, original-file drop payloads, and the 500-card benchmark.

The packaged executable passed `node scripts/smoke.mjs`, including version/name/icon checks, the unchanged profile path, native SQLite/Sharp, canvas editing and persistence, references, themes, safe screenshots, and sticky-edge movement. Windows installer metadata reports Weave 0.3.8. The unsigned x64 installer is 134,962,522 bytes. SHA-256: `f2a630d2d3e542fa2b64301a1b2199265b130f4525592de936125b7e9516bd72`.

Windows' interactive OLE drag loop and third-party website sign-in/uploads were not tested. The packaged payload was launched directly; the installer was not installed into the user's account during verification. Vite reports its existing main-chunk size advisory.

# Embedded browser and attachments - 2026-09-24 (feature verification)

The production build and TypeScript check passed, along with 53 unit tests and five targeted desktop scenarios (two embedded-browser tests and three existing library/reference tests). Browser checks cover navigation and history, popup links opening in the panel, rejection of local-file addresses, session/API isolation, window resizing, hiding behind workspace dialogs, and reopening the existing page.

Attachment tests capture the real file paths produced by the canvas and multi-selection library drag handlers, then deliver those files through Chromium's drag protocol to a local attachment page. Both original PNG files arrive byte-for-byte intact. Invalid asset IDs are rejected. These tests do not exercise Windows' interactive OLE drag loop or sign-in/uploads on third-party websites. The installer was not rebuilt or published. Vite still reports its existing advisory about the main JavaScript chunk exceeding 500 kB.

# Weave 0.3.7 - 2026-09-23

Rebranded the app as Weave and packaged `release/Weave Setup 0.3.7.exe`. The approved flame icon appears in the header, favicon, native window, executable, and installer. Windows product metadata reports Weave 0.3.7, and all seven approved ICO frames were verified in both executables.

TypeScript and production build passed, all 51 unit tests passed, and the browser integration check passed project create/save/reopen, library metadata, imports, recent projects, and RPC errors. The packaged smoke check passed, including Weave's app name, page title, loaded icon, and unchanged `%APPDATA%/local-imagine-workspace` profile path, plus the existing canvas and persistence scenarios. The installer retains `local.imagine.workspace` as its upgrade identity. Actual installation over an existing user installation was not performed.

The Windows x64 installer is 134,957,398 bytes. SHA-256: `a25496a8d0596ba84aa61ed2b923023308102075fd67d9b20089bdb25ef5a3c4`. The installer and matching checksum are saved in `release/`. The packaged payload was tested directly; the installer was not installed or published during verification.

# Version 0.3.6 - 2026-09-23

Bumped the application and lockfile from 0.3.5 to 0.3.6 and built `release/Local Imagine Workspace Setup 0.3.6.exe` with the folders, character references, Codex task queue, reference drag/drop, and sticky-edge features. Rebuilt the same version with the left-aligned start screen and main view flush to the window, without the outer inset, border, or rounded corners. TypeScript and the production build passed. The preceding feature verification passed all 51 unit tests and 23 desktop scenarios.

The freshly packaged executable passed `node scripts/smoke.mjs`, including an application-version assertion, native SQLite/Sharp, canvas editing, existing UI checks, persistent library metadata, and connected sticky-edge movement. The unsigned x64 NSIS installer is 134,667,989 bytes. SHA-256: `c4ac03d89da25bdf0c5faec073bcfcf5d3173dbca12bb053a6eb4a259667722b`. Matching checksum files are saved beside the installer. The packaged payload was tested directly; the installer was not installed into the user's account or published to GitHub.

# Sticky edges - 2026-09-23

Touching edges now take priority over grid and center snapping within eight screen pixels. The guide and crosshair use the configurable cyan sticky-edge color, and a join button locks/unlocks edges. Connections persist in board item data, support undo/redo, and move as connected sets through pointer dragging, alignment, and Codex move commands. Linked resizing is disabled; deleting endpoints removes stale links and duplication remaps only copied connections.

Production build and TypeScript checks passed. All 51 unit tests and all 23 Electron desktop scenarios passed, including the 500-card pan benchmark. New tests cover horizontal/vertical edge priority, screen-space thresholds, shared-span requirements, chains, locked peers, grouped members, copy remapping, crosshair color, lock/unlock controls, persistence across an application restart, movement from either endpoint, deletion cleanup and undo. The locked-edge screenshot was visually inspected. No installer was produced.

# Workspace features - 2026-09-23

Added nested library folders, saved character profiles, dropping items into groups, reference drops into Codex, and a session queue for Codex requests. The production build and TypeScript checks passed, along with all 45 unit tests and all 21 Electron desktop scenarios. The build emits Vite's advisory about the main JavaScript chunk exceeding 500 kB.

New coverage checks library validation, nested group expansion without position drift, locked items and cycle prevention, folder/profile reloads, library and character drag-to-chat, canvas-to-chat position restoration, group membership undo/redo, serial queue dispatch, reordering, cancellation, failure/stop pauses, and character/reference snapshots at enqueue time. A real hidden Electron backend restart through the browser transport preserved nested folders and character metadata; rejected metadata left the saved library intact.

The queue provider is synthetic in desktop tests. No authenticated online generation was performed. Pending Codex tasks last only for the current project session; folders and character profiles are stored in the project database. No installer or release was produced for these changes.

# Version 0.3.5 - 2026-09-20

GitHub release preparation: all 41 unit tests and all 18 Electron desktop scenarios passed in one full run. The browser integration check passed against the real hidden Electron backend, covering project creation, saving/reopening, binary image import, image serving, recent projects, and RPC errors. TypeScript checking and the production build passed.

Built a fresh Windows x64 NSIS installer, `Local Imagine Workspace Setup 0.3.5.exe`. The packaged executable passed `node scripts/smoke.mjs`, including native SQLite/Sharp, text editing, context actions, recent projects, sensitive-item screenshot masking, themes, item colors, and rigid group movement. Windows reports the installer as unsigned. The installer was not installed into the user's account; the packaged payload was launched directly. SHA-256: `be73af77e3d87a5706b61c62eb68a8fd5cf324ce9670999c1237c17b2f52853e`.

The README includes three user-supplied artwork screenshots and one synthetic test screenshot with descriptions of board organization, local generation setup, grouped character variants, and image actions. Those example images are documentation, not generation-test evidence. Real ComfyUI inference and authenticated Codex imagegen remain unverified as described below.

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
