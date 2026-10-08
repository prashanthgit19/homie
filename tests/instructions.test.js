'use strict';
// Tests for hooks/homie-instructions.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'homie-instr-test-'));
process.env.XDG_CONFIG_HOME = tmpRoot;

const { filterSkillBodyForLevel, getHomieInstructions, getFallbackInstructions } =
  require('../hooks/homie-instructions');
const { normalizeLevel } = require('../hooks/homie-config');

test('off produces no injection', () => {
  assert.equal(getHomieInstructions('off'), '');
  assert.equal(getHomieInstructions(null), '');
  assert.equal(getHomieInstructions('banana'), '');
});

test('header names the level', () => {
  assert.ok(getHomieInstructions('yo').startsWith('HOMIE MODE ACTIVE — level: yo'));
  assert.ok(getHomieInstructions('dawg').startsWith('HOMIE MODE ACTIVE — level: dawg'));
  assert.ok(getHomieInstructions('mafa').startsWith('HOMIE MODE ACTIVE — level: mafa'));
});

test('yo output keeps only the yo row and yo example', () => {
  const out = getHomieInstructions('yo');
  assert.ok(out.includes('| **yo** |'), 'yo table row survives');
  assert.ok(!out.includes('| **dawg** |'), 'dawg row dropped');
  assert.ok(!out.includes('| **mafa** |'), 'mafa row dropped');
  assert.ok(/- yo: "/.test(out), 'yo example bullet survives');
  assert.ok(!/- dawg: "/.test(out), 'dawg example dropped');
  assert.ok(!/- mafa: "/.test(out), 'mafa example dropped');
});

test('mafa output keeps only the mafa row and mafa example', () => {
  const out = getHomieInstructions('mafa');
  assert.ok(out.includes('| **mafa** |'));
  assert.ok(!out.includes('| **yo** |'));
  assert.ok(!out.includes('| **dawg** |'));
  assert.ok(/- mafa: "/.test(out));
  assert.ok(!/- yo: "/.test(out));
});

test('contract, voice-lives, guardrails, drop-the-bit survive at every level', () => {
  for (const level of ['yo', 'dawg', 'mafa']) {
    const out = getHomieInstructions(level);
    assert.ok(out.includes('## The contract'), level);
    assert.ok(out.includes('## Banned assistant tells'), level);
    assert.ok(out.includes('## Where the voice lives'), level);
    assert.ok(out.includes('## Guardrails'), level);
    assert.ok(out.includes('## Drop the bit'), level);
    assert.ok(out.includes('## Activation and persistence'), level);
    assert.ok(out.includes('## Levels'), level);
    assert.ok(out.includes('## Examples'), level);
  }
});

test('every injected context carries the identity prelude + precedence + mirror rule', () => {
  for (const level of ['yo', 'dawg', 'mafa']) {
    const out = getHomieInstructions(level);
    assert.ok(out.includes("technically competent friend"), level);
    assert.ok(out.includes('overrides the host'), level);
    assert.ok(out.includes('never lowers your voice'), level);
  }
});

test('scoped guardrail bullets filter to the active level', () => {
  const yo = getHomieInstructions('yo');
  assert.ok(yo.includes('roast decisions, never the person'), 'yo keeps the yo/dawg bullet');
  assert.ok(!yo.includes('no mercy — the person is fair game'), 'yo drops the mafa bullet');

  const mafa = getHomieInstructions('mafa');
  assert.ok(mafa.includes('no mercy — the person is fair game'), 'mafa keeps the mafa bullet');
  assert.ok(!mafa.includes('roast decisions, never the person'), 'mafa drops the yo/dawg bullet');

  // Hard lines are unlabeled and survive everywhere.
  for (const level of ['yo', 'dawg', 'mafa']) {
    const out = getHomieInstructions(level);
    assert.ok(out.includes('No slurs, ever'), level);
    assert.ok(out.includes('Never sacrifice accuracy for the bit'), level);
  }
});

test('non-level bullets are never dropped', () => {
  const out = getHomieInstructions('yo');
  assert.ok(out.includes('- No slurs, ever'), 'hard-line bullet survives');
  assert.ok(out.includes('- Candor isn\'t contrarianism'), 'unlabeled guardrail bullet survives');
});

test('label-free examples survive at every level', () => {
  for (const level of ['yo', 'dawg', 'mafa']) {
    const out = getHomieInstructions(level);
    assert.ok(out.includes('**Personality stays out of the artifact.**'), level);
    assert.ok(out.includes('**Drop the bit.**'), level);
    assert.ok(out.includes('fix(session): handle null user during token refresh'), level);
  }
});

test('frontmatter is stripped from injected body', () => {
  const out = getHomieInstructions('yo');
  assert.ok(!out.includes('---\nname: homie'));
  assert.ok(!out.startsWith('---'));
});

test('fallback instructions carry the level and core blocks', () => {
  for (const level of ['yo', 'dawg', 'mafa']) {
    const out = getFallbackInstructions(level);
    assert.ok(out.includes('HOMIE MODE ACTIVE — level: ' + level));
    assert.ok(out.includes('## The contract'));
    assert.ok(out.includes('## Where the voice lives'));
    assert.ok(out.includes('## Guardrails'));
    assert.ok(out.includes('## Drop the bit'));
    if (level === 'dawg') assert.ok(out.includes('damn, hell, crap'));
  }
});

test('mafa-only profanity examples never reach yo or dawg context', () => {
  for (const level of ['yo', 'dawg']) {
    const out = getHomieInstructions(level);
    assert.ok(!out.includes('Bad mafa'), level);
    assert.ok(!out.includes('Good mafa'), level);
    assert.ok(!out.includes('fucking'), level);
  }
  // mafa keeps its own good/bad examples
  const mafaOut = getHomieInstructions('mafa');
  assert.ok(mafaOut.includes('Bad mafa'));
  assert.ok(mafaOut.includes('Good mafa'));
  assert.ok(mafaOut.includes('One swear, where it counts'));
});

test('block-skip ends at the next bold header or section heading', () => {
  const out = getHomieInstructions('yo');
  // The block after Bad/Good mafa is the label-free artifact example; it must
  // survive at yo.
  assert.ok(out.includes('**Personality stays out of the artifact.**'));
  assert.ok(out.includes('fix(session): handle null user during token refresh'));
  assert.ok(out.includes('**Drop the bit.**'));
});

test('filterSkillBodyForLevel passthrough for off', () => {
  const body = '| **yo** | a |\n| **dawg** | b |\nplain line';
  assert.equal(filterSkillBodyForLevel(body, 'off'), body);
});

test('after(() => cleanup)', () => {});

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});