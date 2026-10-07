#!/usr/bin/env node
// chill — shared instruction builder for hooks and the OpenCode plugin.
//
// Emits the SKILL.md body filtered to the active level: only that level's row
// survives the Levels table, only that level's bullet survives the Examples
// section. The bold-headed examples ("Personality stays out of the artifact",
// "Drop the bit") carry no level label, so they survive at every level —
// correct, they apply to all.

const fs = require('fs');
const path = require('path');
const { normalizeLevel } = require('./chill-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'chill', 'SKILL.md');

// One line survives per level-labeled construct; everything else is kept
// verbatim. Table labels look like `| **yo** | ...` and example bullets like
// `- yo: "..."`. The example bullet requires a quote so ordinary bullets that
// happen to start with a level word are never mistaken for level examples.
//
// The "Bad mafa" / "Good mafa" example blocks are introduced by bold headers
// and span several lines (quote + explanation), so a line filter alone can't
// drop them — and they carry profanity, which must not enter a yo/dawg
// context. Skip from the header to the next bold header or section heading.
const LEVEL_EXAMPLE_HEADER = /^\*\*(?:Bad |Good )?(yo|dawg|mafa)[:.]?\s*(\([^)]*\))?\s*[:.]?\*\*/i;

function filterSkillBodyForLevel(body, level) {
  const effectiveLevel = normalizeLevel(level);
  // `off` (and anything unrecognized) is a passthrough: there is no "off" row
  // or example, so filtering against it would strip every level-labeled line.
  if (!effectiveLevel || effectiveLevel === 'off') return String(body || '');

  let skippingLabeledExample = false;
  return String(body || '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .split(/\r?\n/)
    .filter((line) => {
      // A bold header or section heading ends the current example block.
      if (skippingLabeledExample && (/^\*\*/.test(line) || /^#{1,2} /.test(line))) {
        skippingLabeledExample = false;
      }
      if (skippingLabeledExample) return false;

      const headerMatch = line.match(LEVEL_EXAMPLE_HEADER);
      if (headerMatch) {
        const labelLevel = normalizeLevel(headerMatch[1]);
        if (labelLevel && labelLevel !== effectiveLevel) {
          skippingLabeledExample = true;
          return false;
        }
      }

      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelLevel = normalizeLevel(tableLabel[1].trim());
        if (labelLevel) return labelLevel === effectiveLevel;
      }

      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
      if (exampleLabel) {
        const labelLevel = normalizeLevel(exampleLabel[1].trim());
        if (labelLevel) return labelLevel === effectiveLevel;
      }

      return true;
    })
    .join('\n');
}

function getFallbackInstructions(level) {
  const effectiveLevel = normalizeLevel(level) || 'yo';
  return 'CHILL MODE ACTIVE — level: ' + effectiveLevel + '\n\n' +
    'You are the developer\'s technically competent friend. Same brain, same code, different voice.\n\n' +
    '## The contract\n\n' +
    'Personality changes HOW you communicate. It never changes WHAT you recommend, the tools you use, ' +
    'permissions you request, or commands you run. Candor increases with level; intelligence never decreases. ' +
    'A chill answer is no longer than the neutral one.\n\n' +
    '## Where the voice lives\n\n' +
    'The voice lives in chat prose only. It stays out of code, diffs, commands, file paths, commit messages, ' +
    'PR descriptions, code comments, docstrings, READMEs, log and error strings. Permission requests and ' +
    'warnings before destructive actions stay plain at every level.\n\n' +
    '## Level: ' + effectiveLevel + '\n\n' +
    (effectiveLevel === 'yo'
      ? 'Casual, warm, friendly. Contractions. Light humor. No profanity. No corporate speak.\n\n'
      : effectiveLevel === 'dawg'
        ? 'Direct and candid. Challenges weak ideas. Light roasting. Mild profanity only (damn, hell, crap), and rarely.\n\n'
        : 'Extremely informal technical friend. Slang, sarcasm, humor. Blunt about bad engineering. ' +
          'Profanity when a real friend would swear — zero or one per response, zero always fine.\n\n') +
    '## Guardrails\n\n' +
    'Roast decisions, never the person. When the user is learning or struggling, teach — don\'t mock. ' +
    'Never sacrifice accuracy for the bit.\n\n' +
    '## Drop the bit\n\n' +
    'Prod down, user stuck or frustrated, destructive or irreversible action, credentials or security, ' +
    'something personal: switch to plain, calm, direct. Resume the voice after it\'s resolved.\n\n' +
    '## Persistence\n\n' +
    'ACTIVE EVERY RESPONSE. No drift back to formal tone. Off only: "/chill off" or "stop chill". ' +
    'Switch: /chill yo|dawg|mafa.';
}

function getChillInstructions(level) {
  const effectiveLevel = normalizeLevel(level);
  if (!effectiveLevel || effectiveLevel === 'off') return '';

  try {
    return 'CHILL MODE ACTIVE — level: ' + effectiveLevel + '\n\n' +
      filterSkillBodyForLevel(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveLevel);
  } catch (e) {
    return getFallbackInstructions(effectiveLevel);
  }
}

module.exports = {
  filterSkillBodyForLevel,
  getFallbackInstructions,
  getChillInstructions,
};