# Changelog

## 0.3.7 — 2026-09-23

### Changed

- Rebranded the application as **Weave**, including the interface, window and browser titles, dialogs, Codex identity, Windows executable, and installer.
- Added the approved White Flame icon with gold and red stars to the app header, taskbar, favicon, executable, and installer.
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
