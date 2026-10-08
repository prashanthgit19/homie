#!/usr/bin/env node
// homie — tone-delta harness.
//
// Turns "the voice feels stronger" into a number. Scores agent output for
// objective level-distinctness markers and compares each level against `off`.
//
// It does not call a model. Capture the same prompt's answers once per level
// (off/yo/dawg/mafa), save them, and score:
//
//   node scripts/tone-check.js samples.json
//
// where samples.json is:
//   { "off": ["<answer>", ...], "yo": [...], "dawg": [...], "mafa": [...] }
//
// Exits non-zero if a level fails its gate, so it works as a regression check.
// The pure scorer is also exported for unit tests.

'use strict';

const fs = require('fs');

// Phrases that mark the default assistant persona. Every level should drop
// these relative to `off`.
const BANNED_TELLS = [
  /\bcertainly\b/i,
  /\bgreat question\b/i,
  /\bi'?d be happy to\b/i,
  /\bi'?m happy to\b/i,
  /\bi hope this helps\b/i,
  /\blet me know if you\b/i,
  /\bfeel free to\b/i,
  /\bsure thing\b/i,
  /\bi'?d be glad to\b/i,
];

// Playful hype reactions that mark dawg.
const HYPE_WORDS = [
  /\binsanee+\b/i,
  /\bno wayy+\b/i,
  /\bdamn that'?s crazy\b/i,
  /\bwhat the hell\b/i,
  /\bjeez\b/i,
  /\bwild\b/i,
];

// A small, explicit profanity list for the mafa budget count. Matches whole
// words only; deliberately not exhaustive — it is a floor, not a ceiling.
const PROFANITY = [
  /\bfuck(ing|ed|s)?\b/i,
  /\bshit\b/i,
  /\bbullshit\b/i,
  /\bdogshit\b/i,
  /\bdamn\b/i,
  /\bhell\b/i,
  /\bcrap\b/i,
];

function countMatches(text, patterns) {
  let n = 0;
  for (const re of patterns) {
    const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (m) n += m.length;
  }
  return n;
}

function countContractions(text) {
  const m = text.match(/\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi);
  return m ? m.length : 0;
}

function bulletLines(text) {
  return text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+/.test(l)).length;
}

function nonEmptyLines(text) {
  return text.split(/\r?\n/).filter((l) => l.trim().length).length;
}

function sentenceLengths(text) {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).length);
}

// Score a set of sample answers for one level.
function scoreSamples(samples, level) {
  const texts = (samples || []).map((s) => String(s));
  const joined = texts.join('\n\n');
  const words = joined.split(/\s+/).filter(Boolean).length || 1;
  const sentences = sentenceLengths(joined);
  const bullets = bulletLines(joined);
  const lines = nonEmptyLines(joined) || 1;

  return {
    level,
    samples: texts.length,
    words,
    bannedTells: countMatches(joined, BANNED_TELLS),
    contractions: countContractions(joined),
    hype: countMatches(joined, HYPE_WORDS),
    profanity: countMatches(joined, PROFANITY),
    // Per-response profanity: the mafa budget is per response, so score the max.
    maxProfanityPerResponse: texts.length
      ? Math.max(...texts.map((t) => countMatches(t, PROFANITY)))
      : 0,
    bulletRatio: bullets / lines,
    avgSentenceWords: sentences.length
      ? Math.round((sentences.reduce((a, b) => a + b, 0) / sentences.length) * 10) / 10
      : 0,
  };
}

// Gates: what each level must show across the sample set. Returns failures.
function evaluateGates(scores) {
  const failures = [];
  const off = scores.off || { bannedTells: 0, contractions: 0 };
  const offWordRate = off.contractions / (off.words || 1);

  for (const level of ['yo', 'dawg', 'mafa']) {
    const s = scores[level];
    if (!s) continue;

    // Every level drops the assistant tells below the off baseline.
    if (off.bannedTells > 0 && s.bannedTells >= off.bannedTells) {
      failures.push(`${level}: banned assistant tells did not drop vs off (off ${off.bannedTells}, ${level} ${s.bannedTells})`);
    }

    // yo/dawg/mafa should not be MORE bulleted than off.
    if (s.bulletRatio > (off.bulletRatio || 0) + 0.1) {
      failures.push(`${level}: more bullet-heavy than off (off ${off.bulletRatio.toFixed(2)}, ${level} ${s.bulletRatio.toFixed(2)})`);
    }

    if (level === 'yo' && s.profanity > 0) {
      failures.push(`yo: must have zero profanity, found ${s.profanity}`);
    }

    if (level === 'dawg') {
      if (s.hype < 1) failures.push('dawg: no hype reaction found (want at least one)');
      if (s.maxProfanityPerResponse > 2) {
        failures.push(`dawg: too much profanity per response (${s.maxProfanityPerResponse}); dawg is mild and rare`);
      }
    }

    if (level === 'mafa') {
      if (s.maxProfanityPerResponse > 4) {
        failures.push(`mafa: profanity above budget (${s.maxProfanityPerResponse} > 4 per response)`);
      }
      if (s.hype > 0) failures.push('mafa: hype words are dawg vocabulary, not mafa');
    }

    // A voice should be at least as casual as off (contractions per word).
    const rate = s.contractions / (s.words || 1);
    if (offWordRate > 0 && rate < offWordRate * 0.5) {
      failures.push(`${level}: fewer contractions than off (looks more formal, not less)`);
    }
  }

  return failures;
}

function formatTable(scores) {
  const cols = ['level', 'samples', 'words', 'bannedTells', 'contractions', 'hype', 'profanity', 'maxProf/msg', 'bulletRatio', 'avgSentWords'];
  const rows = ['off', 'yo', 'dawg', 'mafa'].filter((l) => scores[l]).map((l) => {
    const s = scores[l];
    return [
      s.level, s.samples, s.words, s.bannedTells, s.contractions, s.hype,
      s.profanity, s.maxProfanityPerResponse, s.bulletRatio.toFixed(2), s.avgSentenceWords,
    ];
  });
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  return [fmt(cols), fmt(widths.map((w) => '—'.repeat(w))), ...rows.map(fmt)].join('\n');
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/tone-check.js <samples.json>');
    console.error('  samples.json = { "off": ["..."], "yo": ["..."], "dawg": ["..."], "mafa": ["..."] }');
    process.exit(2);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('could not read samples:', e.message);
    process.exit(2);
  }

  const scores = {};
  for (const level of ['off', 'yo', 'dawg', 'mafa']) {
    if (Array.isArray(data[level]) && data[level].length) {
      scores[level] = scoreSamples(data[level], level);
    }
  }

  if (!Object.keys(scores).length) {
    console.error('no samples found under keys off/yo/dawg/mafa');
    process.exit(2);
  }

  console.log(formatTable(scores));
  console.log('');

  const failures = evaluateGates(scores);
  if (failures.length) {
    console.log('GATE FAILURES:');
    for (const f of failures) console.log('  ✖ ' + f);
    process.exit(1);
  }
  console.log('✓ all level gates passed');
}

if (require.main === module) main();

module.exports = { scoreSamples, evaluateGates, formatTable };
