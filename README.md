# Local Imagine Workspace

A standalone Windows desktop canvas for local images, notes, reference groups, and ComfyUI generation. Projects and inference stay on your computer. The interface has no account, telemetry, cloud provider, remote font, or runtime CDN dependency.

## Run or install

The unsigned Windows x64 installer is written to `release/Local Imagine Workspace Setup 0.1.2.exe`. The unpacked application is `release/win-unpacked/Local Imagine Workspace.exe`.

For development, install Node.js 24 LTS and run:

```powershell
npm ci
npm run dev
```

`npm run dev` builds and opens the Electron application. It does not start a web server or download inference models. Dependency installation and packaging may require internet access; ordinary app operation does not.

```powershell
npm test
npm run test:desktop
npm run package
```

The lockfile pins dependencies. Native SQLite is rebuilt for Electron during `npm ci`. If you change Electron versions, run `npm run postinstall` before testing or packaging. Packaging produces an unsigned, per-user NSIS installer; no administrator installation is required.

## Use the workspace

1. **Create project** and choose a dedicated folder. A project is a portable folder containing `workspace.sqlite`, originals, outputs, thumbnails, workflow manifests, and a live `.imagine.lock`.
2. Drop PNG, JPEG, or WebP files onto the board, use **Import images**, or paste an image with **Ctrl+V**. Originals are copied, not moved. Different binary encodings remain separate originals even when pixels match.
3. Add a text card with **T** and double-click to edit it. Image resizing retains the aspect ratio. Use **Ctrl+G** to group, **Ctrl+Shift+G** to ungroup, **Ctrl+D** to duplicate, and **Ctrl+Z/Y** to undo/redo.
4. Hold **Space** to pan, scroll to zoom, or press **F** to fit the selection/board. Click the zoom percentage for 100%.
5. Open the inspector for alignment, locking, naming groups, and deletion. Select exactly two images to compare. Double-click an image to inspect its original; click the enlarged image to toggle actual pixels.
6. The project drawer contains boards and the asset library. Clicking a library image places another copy on the active board. Deleting a placement retains its original asset.

Edits autosave. Text saves after a short pause; **Ctrl+S** flushes pending writes. Close the application before moving, backing up, or copying its project folder. Reopen the moved folder to continue. A second process cannot write to an already-open project. Stale locks from a terminated process recover automatically; an unreadable lock needs manual inspection after confirming no app instance is using the project.

## Grid and alignment snapping (0.1.2)

Use **Grid** and **Guides** at the top of the canvas to toggle snapping. Both start enabled and remember your preference locally. Dragged cards and selections snap to the 24-pixel dot grid. Near another image or note, alignment takes priority: lines mark matching left/right edges, top/bottom edges, or centers within six screen pixels. Selections keep their spacing, including grouped cards, and moves remain undoable. These controls apply to dragging; resizing and import placement retain their existing behavior.

## Right-click menus (0.1.1)

Right-click empty canvas to import, paste, or add a note at that exact location, and access viewport/history actions. Right-click an image, note, group, selection, or generation placeholder for relevant actions. A right-click on an unselected item selects it; right-clicking inside the selection keeps the entire selection. Dragging the right mouse button more than four pixels pans without opening a menu. Space, middle-button, and Hand-tool panning remain available.

Image menus include **Copy image**, **Save original as…**, **Show in Explorer**, **View full resolution**, and **Use as reference**. Copy writes an orientation-correct PNG to the system clipboard; Save As preserves the original bytes and extension. Export destinations must be outside Imagine projects, and the native save dialog confirms external overwrites. File actions apply to one image at a time. Two selected images offer **Compare images**.

Group and note menus provide rename/edit actions. Selection operations are disabled for incompatible or locked targets instead of silently changing a subset. Deleting selected group frames retains their unselected contents, as before. Job menus expose details and the cancel/retry/reconcile actions appropriate to the current state; failed/cancelled placeholders can be removed without deleting job history.

Use **Shift+F10** or the keyboard Menu key to open a context menu, arrows/Home/End to navigate, Enter to act, and Escape to dismiss and restore focus. Menus stay inside the window and close when the viewport, board, or project changes. Editable text fields use the native Cut/Copy/Paste/Select All menu. Menu edits use the same undo and autosave behavior as toolbar and keyboard actions.

## Connect ComfyUI

The app **does not install, launch, upgrade, or modify ComfyUI**. Start your existing installation separately, then open **Generate**, enter its loopback port (default `8188`), and select **Connect**. Remote hosts, LAN addresses, and redirects are not accepted.

The included SDXL templates use standard ComfyUI nodes:

- **Text to image:** installed SDXL-compatible checkpoint, prompt, optional negative prompt, seed, dimensions, and output count.
- **Image to image:** the same model selection plus a board image explicitly assigned as the reference. It uses the source resolution and fixed 0.65 denoise; width/height controls are absent because this template does not resize the source.

ComfyUI exposes checkpoint filenames, not a reliable architecture guarantee. Choose a compatible installed checkpoint and confirm SDXL compatibility; the app never chooses or replaces your model automatically. Missing nodes/models surface before submission. No model weights are bundled.

For other workflows, export **Save (API Format)** JSON from ComfyUI, use **Import API JSON**, and open **Mapping**. Bind the prompt and seed plus any supported optional controls to literal node inputs; select image-producing output nodes. Editor-format JSON is rejected with export guidance. Advanced sampler settings are retained from the imported workflow. A visual node editor is not included.

The graphic-anime preset is editable and enabled by default. The **Style and final prompt** section shows the exact composed prompt. The current request is placed last and declared authoritative over style defaults. Text contained in imported assets is never automatically executed or used as an instruction. Reference-image role and identity preservation are recorded in the composed prompt.

## Jobs, recovery, and provenance

Each batch creates 1–8 durable attempts with concrete seeds before submission. The app dispatches one workflow at a time. Output cards are placed beside the source/viewport anchor; a job with several mapped image outputs creates several cards. Job details include the submitted graph, template revision, model filenames, prompt, seed, source IDs, output IDs, timestamps, and parent attempt on retry. JSON manifests are stored in `workflows/` alongside the SQLite record.

- Removing a queued job affects only that app job.
- Running cancellation first checks that the current server queue contains the matching prompt ID. ComfyUI's interrupt endpoint is global; a server-side queue change between that check and the interrupt is an upstream limitation. Avoid concurrent manual queue changes while cancelling.
- Reconnect uses queue/history and the app's durable client job ID to recover a lost submission response. It never blindly submits the same attempt again.
- If both queue/history lack the attempt, it remains **connection unknown** and blocks dispatch. Preserve the project and inspect ComfyUI; there is intentionally no automatic retry for an ambiguous submission.
- Output download failures reconcile again without rerunning generation. Image files are copied into the project before completion is committed.
- Retrying a failed/cancelled job creates a new linked attempt with the same settings and seed. Changing a workflow does not rewrite a queued job's template/mapping snapshot.

A seed and graph support repeatable settings, not a guarantee of bit-identical output across model/runtime/hardware changes.

## Offline verification

The Electron renderer denies network connections and navigation. Native ComfyUI requests are restricted to IPv4 loopback, with redirects disabled. Standard bundled templates are local by construction.

**A localhost server can still contain custom nodes that access the internet.** Recognized API/cloud nodes are rejected, but arbitrary custom Python cannot be sandboxed by this client. For an imported workflow's first run, disconnect external networking or block egress for the ComfyUI environment while keeping loopback available, then check the offline-test box. After a successful run, **Record successful offline test** stores your explicit confirmation, attempt ID, and timestamp. This is user-confirmed evidence, not automatic firewall attestation. Editing the workflow clears that evidence. Re-test after changing the ComfyUI environment/custom nodes.

Full offline acceptance: with external networking blocked, import images, edit/group the board, save/reopen it, and run text-to-image and image-to-image through a compatible local installation. Nothing should require an external request.

## Verification status and limitations

See `docs/verification.md` for measured results. Automated desktop tests use a visibly labeled local fake ComfyUI server; simulated execution is not real model generation. Real inference requires a separately running compatible installation. Video, Grok export import, embedded graph editing, installation management, and natural-language Agent mode are deferred.

## Architecture

The React/Zustand renderer uses React Flow for positioning, selection, and viewport management. Electron's sandboxed preload exposes a narrow typed API. SQLite and image ingestion live in the main process; Sharp creates local thumbnails. `JobService` uses `ComfyClient` for validation, queue submission, WebSocket progress, polling reconciliation, and asset ingestion. Board saves merge newly arrived generated assets so an older canvas snapshot cannot erase a finished output.

The schema is version 1. Newer unsupported project versions are refused. Future migrations must be explicit. Filesystem reads use asset IDs and checked project-relative paths, including junction/symlink containment; the renderer never supplies an arbitrary filesystem path.

Future Agent mode can call the same project, board, asset, workflow, and provider operations. No placeholder agent or simulated generation is presented in the production UI.
