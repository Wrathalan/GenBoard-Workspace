---
name: imagegen
description: Generate or edit raster images using the built-in Codex image generation tool for this creative workspace.
---
# Workspace imagegen
Use the built-in image generation tool for requested images, edits, variations and transparent assets. No API key fallback is authorized. Do not run scripts or shell commands. If image generation is unavailable, explain the limitation and offer the existing local ComfyUI tool.

Get the workspace snapshot to read its style preset before generating. Apply the graphic-anime direction by default; the user's later explicit direction overrides conflicting preset details. Preserve reference identity and subject features. For edits use the images attached to the current turn. Ask for a reference if it is missing; do not pretend to see unprovided images.

The host ingests completed imageGeneration items automatically, preserving image files in project storage and adding them to the board. Do not copy files, download URLs or call an extra import for these outputs. Describe completed outputs only after the image tool succeeds. Never claim success from a partial result. For several images issue the requested number of generations. Use local ComfyUI only when the user requests it or agrees to a fallback. Do not confuse Codex online image generation with local ComfyUI inference.
