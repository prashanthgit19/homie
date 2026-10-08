'use strict';
// Tests for scripts/tone-check.js — the pure marker scorer.
const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreSamples, evaluateGates } = require('../scripts/tone-check');

test('scoreSamples counts banned tells, profanity, hype, bullets', () => {
  const s = scoreSamples([
    'Certainly! Great question. I\'d be happy to help. Let me know if you have questions.',
  ], 'off');
  assert.equal(s.bannedTells, 4);
  assert.equal(s.profanity, 0);
  assert.ok(s.bulletRatio === 0);
});

test('scoreSamples counts contractions and hype words', () => {
  const s = scoreSamples(["Damn that's crazy, insaneee — no wayyy that works."], 'dawg');
  assert.ok(s.contractions >= 1);
  assert.ok(s.hype >= 3);
});

test('scoreSamples tracks max profanity per response for the mafa budget', () => {
  const s = scoreSamples(['this is dogshit, plain bullshit', 'fine, one damn thing'], 'mafa');
  assert.equal(s.maxProfanityPerResponse, 2);
});

test('evaluateGates passes a well-formed sample set', () => {
  const data = {
    off: ['Certainly! Great question. I hope this helps. Let me know if you have questions.'],
    yo: ["Honestly, I'd hold off on 50. More chunks is mostly noise, not context. Benchmark it first."],
    dawg: ["Damn, 50 chunks? That's insaneee. No wayyy that beats a reranker — watch precision fall off."],
    mafa: ['50 chunks is dogshit, not context. Shut up and listen: benchmark it, add the reranker, then we talk.'],
  };
  const scores = {
    off: scoreSamples(data.off, 'off'),
    yo: scoreSamples(data.yo, 'yo'),
    dawg: scoreSamples(data.dawg, 'dawg'),
    mafa: scoreSamples(data.mafa, 'mafa'),
  };
  assert.deepEqual(evaluateGates(scores), []);
});

test('evaluateGates flags yo profanity, dawg hype absence, mafa over-budget', () => {
  const scores = {
    off: scoreSamples(['Certainly. I hope this helps.'], 'off'),
    yo: scoreSamples(['Yeah, that fucking thing is fine.'], 'yo'),
    dawg: scoreSamples(['I would not do that. It is a bad idea.'], 'dawg'),
    mafa: scoreSamples(['fuck this shit damn hell crap bullshit dogshit'], 'mafa'),
  };
  const failures = evaluateGates(scores);
  assert.ok(failures.some((f) => f.startsWith('yo: must have zero profanity')));
  assert.ok(failures.some((f) => f.startsWith('dawg: no hype reaction')));
  assert.ok(failures.some((f) => f.startsWith('mafa: profanity above budget')));
});
