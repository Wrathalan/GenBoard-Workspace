# Release automation

“Push update” means updating the version and notes, capturing current screenshots, committing and pushing the app, pushing the matching stable version tag, waiting for GitHub Actions, and finishing Patreon through the signed-in browser.

The Windows release workflow tests the app, builds the installer/updater assets, checks the installer SHA-256 and the manifest SHA-512, uploads them to a draft, verifies GitHub's asset digests, uploads reviewed screenshots as release assets, and publishes. Existing published releases are preserved. Existing draft assets must match exactly; conflicting assets fail rather than being overwritten. Use a new version for a changed installer.

After a successful publication it calls `announce-release.yml` directly. This avoids relying on another event being triggered by `GITHUB_TOKEN`. The announcement verifies a stable, complete release and checks that the webhook targets Brightwater's announcements channel. It includes release notes, the download link, and screenshots. Mentions are disabled.

The webhook URL is stored only as the encrypted repository Actions secret `DISCORD_RELEASE_WEBHOOK`. It is a posting credential; never put it in code, issues, screenshots, logs, or release notes. Revoke it in Discord channel settings if compromised.

For verification or recovery, run **Announce published release** from Actions on `main`, supply the published tag, and keep **dry_run** checked to verify without posting. Uncheck it to send. Successful messages are recorded using `<!-- weave-discord-announced:MESSAGE_ID -->` in the GitHub release body; reruns skip recorded announcements. Pre-existing manual announcements can be recorded with the same marker. If delivery succeeds but recording fails, or a connection timeout makes delivery uncertain, inspect Discord and record the existing message ID before retrying. The script deliberately does not retry message sends automatically.

Patreon is completed separately through the signed-in browser, using the release notes, verified release URL, and reviewed current screenshots. Verify the published page. Login challenges may need Alan's help.

## Screenshots

`node scripts/capture-release-screenshots.mjs` launches the current packaged executable in a demo project and captures the actual app interface. It uses already-public example artwork. Codex working/ready states are controlled demonstrations, not a live generation or timing benchmark. Review captures before sharing. The script changes no production project.

Automation tests: `node --test tests/release-automation.test.mjs`.
