'use strict';
// Tests for hooks/chill-config.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the config dir per test run via XDG_CONFIG_HOME so tests never
// touch the real ~/.config/chill.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chill-config-test-'));
process.env.XDG_CONFIG_HOME = tmpRoot;

const config = require('../hooks/chill-config');

test('default level is yo', () => {
  delete process.env.CHILL_DEFAULT_LEVEL;
  assert.equal(config.getDefaultLevel(), 'yo');
});

test('env beats config file beats default', () => {
  process.env.CHILL_DEFAULT_LEVEL = 'dawg';
  assert.equal(config.getDefaultLevel(), 'dawg');
  delete process.env.CHILL_DEFAULT_LEVEL;
});

test('invalid env values fall through to config file', () => {
  fs.mkdirSync(config.getConfigDir(), { recursive: true });
  fs.writeFileSync(config.getConfigPath(), JSON.stringify({ defaultLevel: 'mafa' }));
  process.env.CHILL_DEFAULT_LEVEL = 'banana';
  assert.equal(config.getDefaultLevel(), 'mafa');
  delete process.env.CHILL_DEFAULT_LEVEL;

  // config file beats default
  assert.equal(config.getDefaultLevel(), 'mafa');

  // invalid config value falls through to default
  fs.writeFileSync(config.getConfigPath(), JSON.stringify({ defaultLevel: 'nope' }));
  assert.equal(config.getDefaultLevel(), 'yo');
});

test('normalizeLevel trims, case-folds, rejects unknown', () => {
  assert.equal(config.normalizeLevel('  Mafa '), 'mafa');
  assert.equal(config.normalizeLevel('DAWG'), 'dawg');
  assert.equal(config.normalizeLevel('off'), 'off');
  assert.equal(config.normalizeLevel('banana'), null);
  assert.equal(config.normalizeLevel(''), null);
  assert.equal(config.normalizeLevel(null), null);
  assert.equal(config.normalizeLevel(undefined), null);
});

test('writeDefaultLevel round-trips, invalid rejected', () => {
  fs.rmSync(config.getConfigDir(), { recursive: true, force: true });
  assert.equal(config.writeDefaultLevel('mafa'), 'mafa');
  assert.equal(config.getDefaultLevel(), 'mafa');
  assert.equal(config.writeDefaultLevel('banana'), null);
  assert.equal(config.writeDefaultLevel('review'), null);
  // invalid write left the previous value intact
  assert.equal(config.getDefaultLevel(), 'mafa');
});

test('BOM-prefixed config file parses', () => {
  fs.mkdirSync(config.getConfigDir(), { recursive: true });
  fs.writeFileSync(config.getConfigPath(), '\uFEFF' + JSON.stringify({ defaultLevel: 'dawg' }));
  assert.equal(config.getDefaultLevel(), 'dawg');
});

test('isDeactivationCommand: whole message only', () => {
  assert.equal(config.isDeactivationCommand('stop chill'), true);
  assert.equal(config.isDeactivationCommand('Stop Chill'), true);
  assert.equal(config.isDeactivationCommand('stop chill.'), true);
  assert.equal(config.isDeactivationCommand('stop chill? '), true);
  assert.equal(config.isDeactivationCommand('chill off'), true);
  assert.equal(config.isDeactivationCommand('please stop chill'), false);
  assert.equal(config.isDeactivationCommand('add a stop chill button'), false);
  assert.equal(config.isDeactivationCommand(''), false);
});

test('isShellSafe allowlists ordinary path characters', () => {
  assert.equal(config.isShellSafe('/home/me/.claude/chill-statusline.sh'), true);
  assert.equal(config.isShellSafe('C:\\Users\\me\\chill-statusline.ps1'), true);
  assert.equal(config.isShellSafe('/tmp/a path with spaces/x.sh'), true);
  assert.equal(config.isShellSafe('/tmp/e$(rm -rf)/x.sh'), false);
  assert.equal(config.isShellSafe('/tmp/`backtick`/x.sh'), false);
  assert.equal(config.isShellSafe(null), false);
});

// Cleanup after all tests finish
test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});