import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const channel = '1559212961044889631';
const guild = '1559211049905954817';
const marker = /<!-- weave-discord-announced:(\d+) -->/;
const repo = process.env.GITHUB_REPOSITORY || 'Wrathalan/GenBoard-Workspace';
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function assetNames(version) {
  return [
    `Weave.Setup.${version}.exe`,
    `Weave.Setup.${version}.exe.blockmap`,
    'latest.yml',
    'SHA256SUMS.txt',
  ];
}

export function validateTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || ''))
    throw new Error('Expected a stable version tag, such as v0.4.6.');
  return tag.slice(1);
}

export function validateRelease(release, tag) {
  const version = validateTag(tag);
  if (release.tag_name !== tag || release.draft || release.prerelease)
    throw new Error('Expected a published stable release.');
  for (const name of assetNames(version)) {
    const asset = release.assets.find((asset) => asset.name === name);
    if (!asset || asset.state !== 'uploaded' || asset.size <= 0)
      throw new Error(`Missing complete release asset: ${name}`);
  }
  return version;
}

export function announcement(release, repository = repo) {
  const version = validateRelease(release, release.tag_name);
  const notes = release.body
    .replace(/<!--[^]*?-->/g, '')
    .replace(/^# [^\n]*\n/, '')
    .split(/\n## /)[0]
    .trim();
  const description = notes.length > 3600 ? `${notes.slice(0, 3597)}...` : notes;
  const imageRoot = `https://raw.githubusercontent.com/${repository}/${release.tag_name}/docs/screenshots`;
  return {
    username: 'Weave Releases',
    allowed_mentions: { parse: [] },
    content: `**Weave ${version} is live!**\nDownload the Windows installer and read the full release notes:\n${release.html_url}\n\nSave your project before updating. The Windows installer is unsigned.`,
    embeds: [
      {
        title: `Weave ${version} — What's new`,
        url: release.html_url,
        description,
        color: 8497244,
        image: { url: `${imageRoot}/release-workspace.png` },
      },
      {
        title: 'Codex Your turn alert — demo conversation',
        color: 8497244,
        image: { url: `${imageRoot}/release-codex-ready.png` },
      },
      {
        title: 'Browser import controls',
        color: 8497244,
        image: { url: `${imageRoot}/release-browser.png` },
      },
    ],
  };
}

async function github(route, method = 'GET', body, type = 'application/json') {
  if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required.');
  const url = route.startsWith('https://') ? route : `https://api.github.com/repos/${repo}${route}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': type,
    },
    body:
      body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(300_000),
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function getRelease(tag) {
  const release = await github(`/releases/tags/${encodeURIComponent(tag)}`);
  if (!release) throw new Error(`No release found for ${tag}.`);
  return release;
}

function check(tag) {
  const version = validateTag(tag);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  if (pkg.version !== version || lock.version !== version || lock.packages[''].version !== version)
    throw new Error('Tag and package/lockfile versions must match.');
  const notes = readFileSync(`docs/releases/${version}.md`, 'utf8');
  if (!notes.trim()) throw new Error('Release notes must not be empty.');
  return { version, notes };
}

export async function publish(tag) {
  const { version, notes } = check(tag);
  let release = await github(`/releases/tags/${encodeURIComponent(tag)}`);
  if (release && !release.draft) {
    validateRelease(release, tag);
    console.log(`Already published: ${release.html_url}`);
    return;
  }
  const files = assetNames(version).map((name) => ({
    name,
    bytes: readFileSync(`release/${name}`),
  }));
  const installer = files[0];
  const checksum = files[3].bytes.toString('utf8').trim();
  if (checksum !== `${digest(installer.bytes).slice(7)}  ${installer.name}`)
    throw new Error('Installer checksum file does not match.');
  const manifest = files[2].bytes.toString('utf8');
  const sha512 = createHash('sha512').update(installer.bytes).digest('base64');
  if (
    !manifest.includes(`version: ${version}`) ||
    !manifest.includes(installer.name) ||
    !manifest.includes(sha512)
  )
    throw new Error('Updater manifest does not match this installer.');
  if (!release)
    release = await github('/releases', 'POST', {
      tag_name: tag,
      name: `Weave ${version}`,
      body: notes,
      draft: true,
      prerelease: false,
    });
  for (const file of files) {
    let asset = release.assets.find((asset) => asset.name === file.name);
    if (!asset)
      asset = await github(
        `${release.upload_url.split('{')[0]}?name=${encodeURIComponent(file.name)}`,
        'POST',
        file.bytes,
        'application/octet-stream',
      );
    if (
      asset.state !== 'uploaded' ||
      asset.size !== file.bytes.length ||
      asset.digest !== digest(file.bytes)
    )
      throw new Error(`Remote asset mismatch: ${file.name}; refusing to overwrite.`);
  }
  release = await github(`/releases/${release.id}`, 'PATCH', {
    body: notes,
    draft: false,
    make_latest: 'true',
  });
  validateRelease(release, tag);
  console.log(`Published: ${release.html_url}`);
}

export async function discord(tag) {
  let webhook;
  try {
    webhook = new URL(process.env.DISCORD_RELEASE_WEBHOOK);
    if (
      webhook.protocol !== 'https:' ||
      webhook.hostname !== 'discord.com' ||
      !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook.pathname)
    )
      throw new Error();
  } catch {
    throw new Error('A valid DISCORD_RELEASE_WEBHOOK secret is required.');
  }
  // Never log the webhook URL or response body: both contain its credential.
  let response;
  try {
    response = await fetch(webhook, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error('Could not verify Discord webhook.');
  }
  if (!response.ok) throw new Error(`Discord webhook verification failed (${response.status}).`);
  const info = await response.json();
  if (info.channel_id !== channel || info.guild_id !== guild)
    throw new Error('Webhook must target Brightwater announcements.');
  const release = await getRelease(tag);
  validateRelease(release, tag);
  const payload = announcement(release);
  if (process.env.DRY_RUN === 'true') {
    console.log(JSON.stringify(payload, null, 2));
    console.log(
      marker.test(release.body)
        ? 'Webhook verified; this release is already announced.'
        : 'Webhook verified; no message sent.',
    );
    return;
  }
  if (marker.test(release.body)) {
    console.log('Release announcement already recorded; skipping.');
    return;
  }
  webhook.searchParams.set('wait', 'true');
  try {
    response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(
      'Discord delivery uncertain. Check the channel and record its message ID before rerunning.',
    );
  }
  if (!response.ok)
    throw new Error(`Discord send failed (${response.status}); no automatic retry.`);
  const message = await response.json();
  if (!/^\d+$/.test(message.id) || message.channel_id !== channel)
    throw new Error('Unexpected Discord response. Check the channel before rerunning.');
  const link = `https://discord.com/channels/${guild}/${channel}/${message.id}`;
  console.log(`Discord announcement: ${link}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Discord announcement: ${link}\n\nPatreon: publish through the signed-in browser, including reviewed screenshots.\n`,
    );
  const fresh = await getRelease(tag);
  await github(`/releases/${release.id}`, 'PATCH', {
    body: `${fresh.body}\n\n<!-- weave-discord-announced:${message.id} -->`,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    const tag = process.env.RELEASE_TAG;
    validateTag(tag);
    if (command === 'check') {
      check(tag);
      console.log('Version and release notes verified.');
    } else if (command === 'publish') await publish(tag);
    else if (command === 'discord') await discord(tag);
    else throw new Error('Usage: node scripts/release.mjs check|publish|discord');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
