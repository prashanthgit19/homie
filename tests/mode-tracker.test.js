'use strict';
// Tests for hooks/homie-mode-tracker.js — exercised as a child process with
// piped stdin, plus unit tests of the runtime flag IO.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Isolate state and config so tests never touch real ~/.claude or ~/.config.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'homie-tracker-test-'));
process.env.XDG_CONFIG_HOME = tmpRoot;
process.env.CLAUDE_CONFIG_DIR = path.join(tmpRoot, 'claude');
delete process.env.CLAUDE_PROJECT_DIR;

const runtime = require('../hooks/homie-runtime');
const config = require('../hooks/homie-config');

const trackerPath = path.resolve(__dirname, '../hooks/homie-mode-tracker.js');

// Run the tracker with the given prompt JSON; resolve with stdout + exit code.
function runTracker(promptObj, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [trackerPath], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; child.kill('SIGKILL'); reject(new Error('tracker timed out')); }
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    child.on('close', (code) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ stdout, code }); }
    });
    child.stdin.end(JSON.stringify(promptObj));
  });
}

const readFlag = () => {
  try { return fs.readFileSync(runtime.statePath, 'utf8').trim(); } catch (e) { return null; }
};

test.before(() => {
  fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
});

test('/homie mafa persists the level and emits the new ruleset', async () => {
  const { stdout } = await runTracker({ prompt: '/homie mafa' });
  assert.equal(readFlag(), 'mafa');
  assert.ok(stdout.includes('HOMIE MODE CHANGED — level: mafa'));
  assert.ok(stdout.includes('HOMIE MODE ACTIVE — level: mafa') || stdout.includes('| **mafa** |'));
});

test('bare /homie while off turns on at yo', async () => {
  runtime.setLevel('off'); // off is persisted like any level
  const { stdout } = await runTracker({ prompt: '/homie' });
  assert.equal(readFlag(), 'yo');
  assert.ok(stdout.includes('HOMIE MODE CHANGED — level: yo'));
});

test('bare /homie while active reports the level, flag untouched', async () => {
  runtime.setLevel('dawg');
  const { stdout } = await runTracker({ prompt: '/homie' });
  assert.equal(readFlag(), 'dawg');
  assert.ok(stdout.includes('HOMIE MODE ACTIVE — level: dawg'));
  assert.ok(!stdout.includes('HOMIE MODE CHANGED'));
});

test('/homie banana leaves the current level alone', async () => {
  runtime.setLevel('dawg');
  const { stdout } = await runTracker({ prompt: '/homie banana' });
  assert.equal(readFlag(), 'dawg');
  assert.equal(stdout, '');
});

test('/homie off persists off (flag not cleared)', async () => {
  runtime.setLevel('mafa');
  const { stdout } = await runTracker({ prompt: '/homie off' });
  assert.equal(readFlag(), 'off');
  assert.ok(stdout.includes('HOMIE MODE OFF'));
});

test('"stop homie" as whole message deactivates', async () => {
  runtime.setLevel('mafa');
  const { stdout } = await runTracker({ prompt: 'Stop homie.' });
  assert.equal(readFlag(), 'off');
  assert.ok(stdout.includes('HOMIE MODE OFF'));
});

test('"add a stop homie button" does NOT deactivate', async () => {
  runtime.setLevel('mafa');
  const { stdout } = await runTracker({ prompt: 'add a stop homie button' });
  assert.equal(readFlag(), 'mafa');
  assert.equal(stdout, '');
});

test('plain requests ("be blunter") do not touch the flag', async () => {
  runtime.setLevel('yo');
  const { stdout } = await runTracker({ prompt: 'be blunter' });
  assert.equal(readFlag(), 'yo');
  assert.equal(stdout, '');
});

test('/homie default mafa writes config, session level unchanged', async () => {
  runtime.setLevel('yo');
  const { stdout } = await runTracker({ prompt: '/homie default mafa' });
  assert.equal(readFlag(), 'yo');
  assert.equal(config.getDefaultLevel(), 'mafa');
  assert.ok(stdout.includes('HOMIE DEFAULT SET — new sessions start in mafa'));
});

test('/homie default banana is ignored', async () => {
  const before = config.getDefaultLevel();
  const { stdout } = await runTracker({ prompt: '/homie default banana' });
  assert.equal(config.getDefaultLevel(), before);
});

test('malformed stdin never hangs (exits within the window)', async () => {
  const start = Date.now();
  const { code } = await runTracker({ not: 'json' });
  assert.equal(code, 0);
  assert.ok(Date.now() - start < 4000);
});

test('empty stdin never hangs', async () => {
  const start = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn('node', [trackerPath], { env: { ...process.env } });
    child.on('close', (code) => {
      assert.equal(code, 0);
      resolve();
    });
    child.on('error', reject);
    // end stdin immediately with nothing
    child.stdin.end('');
  });
  assert.ok(Date.now() - start < 4000);
});

test('runtime: readLevel falls back to default when flag absent', () => {
  fs.rmSync(runtime.statePath, { force: true });
  assert.equal(runtime.readLevel(), config.getDefaultLevel());
});

test('runtime: per-project flag is preferred on read', () => {
  // Simulate a project dir
  process.env.CLAUDE_PROJECT_DIR = '/some/project';
  const withProject = require('../hooks/homie-runtime');
  withProject.setLevel('mafa');
  assert.equal(withProject.readLevel(), 'mafa');
  delete process.env.CLAUDE_PROJECT_DIR;
});

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});