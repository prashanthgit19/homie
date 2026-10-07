'use strict';
// Tests for .opencode/plugins/homie.mjs — pins the command UX contract:
// /homie replies are ONE plain line. The ruleset travels through the
// context hook (invisible), never through the visible prompt.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Isolate flag + config so tests never touch real ~/.config.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'homie-plugin-test-'));
process.env.XDG_CONFIG_HOME = tmpRoot;

const pluginPath = path.resolve(__dirname, '../.opencode/plugins/homie.mjs');

// Node caches ES module imports by URL; bust the cache per call so each test
// gets a fresh setup() against its own mock context.
let importCounter = 0;
function freshImport() {
  importCounter += 1;
  return import(pathToFileURL(pluginPath).href + '?run=' + importCounter);
}

function makeCtx() {
  // One object: the transform callbacks and the test read the same ctx.
  const ctx = {};
  Object.assign(ctx, {
    skill: { transform: async (fn) => fn({ add: (s) => { ctx.skillAdded = s; } }) },
    command: { transform: async (fn) => fn({ add: (c) => { ctx.commandAdded = c; } }) },
    session: {
      hook: async () => ({}),
      prompt: async (args) => { ctx.sent = args; },
    },
  });
  return ctx;
}

async function runCommand(text) {
  const mod = await freshImport();
  const ctx = makeCtx();
  await mod.default.setup(ctx);
  await ctx.commandAdded.execute({ sessionID: 's1', prompt: { text }, delivery: 'steer' });
  return ctx.sent.text;
}

test('skill and command are registered', async () => {
  const mod = await freshImport();
  const ctx = makeCtx();
  await mod.default.setup(ctx);
  assert.equal(ctx.skillAdded.id, 'homie');
  assert.equal(ctx.commandAdded.name, 'homie');
  assert.ok(ctx.commandAdded.description.length > 0);
});

test('/homie dawg replies one plain line, no ruleset dump', async () => {
  const text = await runCommand('dawg');
  assert.equal(text, 'Homie mode: dawg.');
  assert.ok(!text.includes('# Homie'));
  assert.ok(!text.includes('HOMIE MODE ACTIVE'));
  assert.ok(!text.includes('## '));
});

test('/homie off replies one line', async () => {
  const text = await runCommand('off');
  assert.equal(text, 'Homie off.');
});

test('unknown level replies one line, flag untouched', async () => {
  await runCommand('dawg');
  const text = await runCommand('banana');
  assert.equal(text, 'Unknown level "banana". Levels: off, yo, dawg, mafa.');
  const after = await runCommand(''); // bare reports current level
  assert.equal(after, 'Homie mode: dawg.');
});

test('bare /homie while off turns on at yo', async () => {
  await runCommand('off');
  const text = await runCommand('');
  assert.equal(text, 'Homie mode: yo.');
});

test('bare /homie while active reports, flag untouched', async () => {
  await runCommand('mafa');
  const text = await runCommand('');
  assert.equal(text, 'Homie mode: mafa.');
});

test('/homie default mafa writes config and replies one line', async () => {
  const text = await runCommand('default mafa');
  assert.equal(text, 'Homie default set: mafa. New sessions start at mafa.');
});

test('/homie default banana replies usage, config untouched', async () => {
  const before = JSON.stringify(require('../hooks/homie-config').getDefaultLevel());
  const text = await runCommand('default banana');
  assert.equal(text, 'Usage: /homie default <level>. Levels: off, yo, dawg, mafa.');
  assert.equal(JSON.stringify(require('../hooks/homie-config').getDefaultLevel()), before);
});

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});