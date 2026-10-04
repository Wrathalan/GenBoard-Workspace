# Changelog

## 0.3.10 — 2026-10-04

### Codex image attachments

- Send reference image data directly to Codex as ordered attachments, avoiding Windows-path handoff failures and preserving original bytes.
- Raise chat and character references from five to 16, share validation across transports, deduplicate overlapping references, and show the combined count.
- Wrap thumbnail previews and reject invalid, missing, oversized, or excessive attachments explicitly. Tell the native generator to report any lower runtime limit instead of silently using a subset.

### Tabbed boards

- Switch boards directly from a scrollable header tab strip, with the active board highlighted and kept in view.
- Create a named board with the + button and double-click the active tab to rename it. The search menu and previous-board button remain available.
- Use Left/Right or Home/End to focus tabs, then Enter or Space to switch, retaining save-before-navigation and Codex busy protection.

### LAN ComfyUI

- Connect to ComfyUI on another computer using an explicit host/IP and port in Generate. Loopback remains the default; desktop, browser mode, and the workspace agent share the connection API.
- Show the connected endpoint and explain LAN listen/firewall requirements when connections fail.
- Preserve the existing connection after a failed reconnect and keep unfinished jobs tied to their original server.

## 0.3.9 — 2026-09-26 — Board navigation

- Search this project's boards from the header, or press Ctrl+Shift+B from workspace controls. Navigate results with arrow keys and Enter.
- Name new boards before creating them and rename the current board directly from the switcher or Inspector.
- Return to the previous board with the header arrow, preserving saved canvas content, pan, and zoom.
- Explain when a running Codex turn blocks navigation while keeping board search available. Creating and activating a board is now atomic, so a failed activation cannot leave an extra board behind.
- Keep naming and navigation failures beside the action, retain entered names for retry, and prevent duplicate submissions.

## 0.3.8 — 2026-09-24

- Added a desktop browser panel with an address bar, back/forward navigation, reload/stop, and a separate persistent website session.
- Added globe drag handles to canvas images and library thumbnails for attaching original files to websites. Library selections support multi-image attachments without changing canvas positions.
- Kept website content isolated from the workspace API and local renderer session. The browser panel hides for workspace dialogs and safe screenshots.

## 0.3.7 — 2026-09-23

### Changed

- Rebranded the application as **Weave**, including the interface, window and browser titles, dialogs, Codex identity, Windows executable, and installer.
- Added the approved flame icon with gold and red stars to the app header, taskbar, favicon, executable, and installer.
- Preserved the existing installer identity and user profile location so upgrades retain recent projects, preferences, and Codex sign-in. Existing project files remain compatible.

## 0.3.6 — 2026-09-23

### Added

- Nested library folders with drag-and-drop organization, batch moves, renaming, and removal that preserves images.
- Saved character profiles with identity notes and up to five reference images, available from the Codex composer or by dragging a profile into chat.
- Drag-and-drop into canvas groups, with automatic frame expansion and undo/redo.
- Reference drops from the library, canvas, or local image files into Codex. Dragging a canvas reference into chat preserves its board position.
- A Codex task queue with pause, resume, reorder, and cancel controls. Tasks capture their prompt, references, character details, target board, and output position when queued; failures and Stop pause subsequent tasks.
- Sticky edges: touching edges take priority over grid and center snapping, show a cyan crosshair, and offer a lock button. Connected items move together until unlocked, including through group movement and Codex commands.
- Persistent edge locks with undo/redo, safe duplication and deletion behavior, and a configurable alignment color.

### Changed

- Left-aligned the start screen within the available canvas, with consistent padding when the Codex panel is open or closed.
- Removed the application's outer margin, border, and rounded corners so the main view fills the window.
- Updated the application and Windows x64 installer to version 0.3.6.

### Verification and limitations

- Feature verification passed 51 unit tests and 23 Electron desktop scenarios, including the 500-card pan benchmark. The production build, browser persistence check, and rebuilt packaged-app smoke check passed.
- Folders, character profiles, and edge locks persist in the project. Pending Codex tasks last for the current project session and are cleared on reload, app closure, or project changes.
- Online Codex generation was not exercised; queue tests use a synthetic provider. The Windows installer is unsigned.

See [verification notes](docs/verification.md) for detailed results and the installer checksum.
