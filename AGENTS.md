# Release workflow

When Alan says "push update", he means: build new Windows executables, push the application updates to GitHub, create and publish a new versioned GitHub release with the complete installer/updater assets, and announce the release on his Patreon and the Brightwater Discord server.

Use the next available version, run the release checks, and verify publication before announcing. Preserve existing unrelated work. Do not commit local models, downloaded tools, private attachments, credentials, or generated installers. If an announcement requires unavailable sign-in or a destination cannot be verified, complete unaffected work and report exactly what remains blocked. The user's explicit instructions and applicable approval requirements still apply.

The tagged GitHub Actions workflow runs the tests, builds Windows assets, verifies checksums, publishes the complete release, and calls the Discord announcement workflow. Use the encrypted `DISCORD_RELEASE_WEBHOOK` repository secret for Brightwater #📣_announcements. Never commit or print its URL. Check the Actions run and recorded announcement before posting manually, to avoid duplicates. An announcement-only workflow supports safe dry runs and retrying the announcement after a release.

Continue handling Patreon through the signed-in browser whenever Alan says "push update". Include fresh, reviewed screenshots of the current app in both announcements. Update the release screenshot captures before tagging. Clearly label demo conversations and sample artwork; do not present simulated replies as live model results.
