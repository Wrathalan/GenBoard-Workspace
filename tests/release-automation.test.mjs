import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetNames, validateTag, validateRelease, announcement } from '../scripts/release.mjs';
const release = () => ({
  tag_name: 'v0.4.5',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/Wrathalan/GenBoard-Workspace/releases/tag/v0.4.5',
  body: '# Weave 0.4.5\n\n- Resizable panels\n\n## Download\nInstaller instructions\n<!-- weave-discord-announced:123 -->',
  assets: assetNames('0.4.5').map((name) => ({ name, state: 'uploaded', size: 100 })),
});
test('rejects branch names and prerelease tags', () => {
  for (const tag of ['main', 'v0.4.5-beta', 'v0.4.5/../x', undefined])
    assert.throws(() => validateTag(tag));
  assert.equal(validateTag('v0.4.5'), '0.4.5');
});
test('never announces drafts, prereleases, incomplete assets, or wrong tags', () => {
  for (const overrides of [
    { draft: true },
    { prerelease: true },
    { tag_name: 'v0.4.4' },
    { assets: release().assets.slice(1) },
    { assets: release().assets.map((a) => ({ ...a, size: 0 })) },
  ])
    assert.throws(() => validateRelease({ ...release(), ...overrides }, 'v0.4.5'));
  assert.equal(validateRelease(release(), 'v0.4.5'), '0.4.5');
});
test('announcement excludes bookkeeping and install section, suppresses mentions and pins screenshots to release tag', () => {
  const payload = announcement(release());
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.match(payload.content, /0\.4\.5/);
  assert.equal(payload.embeds[0].description, '- Resizable panels');
  assert.doesNotMatch(JSON.stringify(payload), /weave-discord-announced|Installer instructions/);
  assert.ok(payload.embeds.length >= 2);
  for (const embed of payload.embeds)
    assert.match(embed.image.url, /\/v0\.4\.5\/docs\/screenshots\//);
});
test('large release notes fit Discord embed description limit', () => {
  const payload = announcement({ ...release(), body: 'a'.repeat(7000) });
  assert.ok(payload.embeds[0].description.length <= 3600);
});

import { discord, publish } from '../scripts/release.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const response = (value, status = 200) =>
  new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
test('Discord verifies destination, sends with wait=true, records success, then skips reruns', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.GH_TOKEN = 'test-token';
  process.env.DISCORD_RELEASE_WEBHOOK = 'https://discord.com/api/webhooks/123/test-token';
  process.env.DRY_RUN = 'false';
  let body = release().body.replace(/<!--.*?-->/, '');
  let sends = 0;
  let records = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('https://discord.com/')) {
      if (options.method === 'POST') {
        assert.match(u, /wait=true/);
        sends++;
        assert.deepEqual(JSON.parse(options.body).allowed_mentions, { parse: [] });
        return response({ id: '456', channel_id: '1559212961044889631' });
      }
      return response({ channel_id: '1559212961044889631', guild_id: '1559211049905954817' });
    }
    if (options.method === 'PATCH') {
      records++;
      body = JSON.parse(options.body).body;
      return response({ ...release(), body });
    }
    return response({ ...release(), body });
  };
  try {
    await discord('v0.4.5');
    await discord('v0.4.5');
    assert.equal(sends, 1);
    assert.equal(records, 1);
    assert.match(body, /weave-discord-announced:456/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
test('wrong Discord channel and dry runs never send announcements', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.GH_TOKEN = 'test-token';
  process.env.DISCORD_RELEASE_WEBHOOK = 'https://discord.com/api/webhooks/123/test-token';
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return response({ channel_id: 'wrong', guild_id: '1559211049905954817' });
    };
    await assert.rejects(discord('v0.4.5'), /must target Brightwater/);
    assert.equal(calls, 1);
    process.env.DRY_RUN = 'true';
    globalThis.fetch = async (url, options = {}) => {
      assert.ok(!options.method || options.method === 'GET');
      return response(
        String(url).startsWith('https://discord.com/')
          ? { channel_id: '1559212961044889631', guild_id: '1559211049905954817' }
          : release(),
      );
    };
    await discord('v0.4.5');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
test('uncertain Discord delivery is not automatically retried or recorded', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.GH_TOKEN = 'test-token';
  process.env.DRY_RUN = 'false';
  process.env.DISCORD_RELEASE_WEBHOOK = 'https://discord.com/api/webhooks/123/test-token';
  let sends = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      sends++;
      throw new Error('timeout');
    }
    assert.notEqual(options.method, 'PATCH');
    return response(
      String(url).startsWith('https://discord.com/')
        ? { channel_id: '1559212961044889631', guild_id: '1559211049905954817' }
        : { ...release(), body: '- New features' },
    );
  };
  try {
    await assert.rejects(discord('v0.4.5'), /delivery uncertain/);
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
test('publication checks local hashes and remote digests before making draft public', async () => {
  const originalFetch = globalThis.fetch,
    originalEnv = { ...process.env },
    cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-release-test-'));
  process.env.GH_TOKEN = 'test-token';
  fs.mkdirSync(path.join(dir, 'docs/releases'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'release'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.4.5' }));
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify({ version: '0.4.5', packages: { '': { version: '0.4.5' } } }),
  );
  fs.writeFileSync(path.join(dir, 'docs/releases/0.4.5.md'), '# Weave 0.4.5\n- Features');
  const installer = Buffer.from('test installer');
  const names = assetNames('0.4.5');
  fs.writeFileSync(path.join(dir, 'release', names[0]), installer);
  fs.writeFileSync(path.join(dir, 'release', names[1]), 'blockmap');
  fs.writeFileSync(
    path.join(dir, 'release/latest.yml'),
    `version: 0.4.5\npath: ${names[0]}\nsha512: ${createHash('sha512').update(installer).digest('base64')}`,
  );
  fs.writeFileSync(
    path.join(dir, 'release/SHA256SUMS.txt'),
    `${createHash('sha256').update(installer).digest('hex')}  ${names[0]}`,
  );
  let published = 0;
  let uploads = 0;
  let mismatch = false;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PATCH') {
      published++;
      return response(release());
    }
    if (options.method === 'POST') {
      uploads++;
      const name = new URL(url).searchParams.get('name');
      return response({
        name,
        state: 'uploaded',
        size: options.body.length,
        digest: mismatch
          ? 'sha256:wrong'
          : `sha256:${createHash('sha256').update(options.body).digest('hex')}`,
      });
    }
    return response({
      ...release(),
      id: 1,
      draft: true,
      assets: [],
      upload_url: 'https://uploads.github.com/repos/test/releases/1/assets{?name}',
    });
  };
  try {
    process.chdir(dir);
    await publish('v0.4.5');
    assert.equal(uploads, 4);
    assert.equal(published, 1);
    mismatch = true;
    await assert.rejects(publish('v0.4.5'), /Remote asset mismatch/);
    assert.equal(published, 1);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
