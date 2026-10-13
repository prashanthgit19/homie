#!/usr/bin/env node
// Format one agent reply for the showcase GIF.
//
// Reads the raw reply on stdin and prints only its opening — about a sentence
// or two — trailing off with an ellipsis. Truncating the *display* instead of
// constraining the prompt keeps the answers genuine: the model writes whatever
// it wants, we just don't show all of it. The register is already unmistakable
// in the first line.
//
// The cut is bounded by a character budget rather than a sentence count, so a
// bullet-heavy reply (whose bullets have no full stops) can't run away. It
// prefers to end on a sentence boundary and falls back to a word boundary.
//
// Env:
//   HOMIE_DEMO_CHARS   max characters to show (default 200)
//   HOMIE_DEMO_WRAP    wrap column (default 96)
//
// Used by scripts/demo.sh; keep it dependency-free.

const budget = Number(process.env.HOMIE_DEMO_CHARS) || 200;
const width = Number(process.env.HOMIE_DEMO_WRAP) || 96;

let text = require("fs")
  .readFileSync(0, "utf8")
  .replace(/\x1b\[[0-9;]*m/g, "") // strip ANSI
  .replace(/\*+|__/g, "") // bold/italic markers (not "_": it lives in identifiers)
  .replace(/`/g, "") // inline-code ticks
  .replace(/^\s*#{1,6}\s+/, "") // leading heading
  .replace(/\s+/g, " ")
  .trim();

if (!text) process.exit(0);

if (text.length > budget) {
  const head = text.slice(0, budget);

  // Last sentence ending in the head. A terminator preceded by a digit is a
  // version/decimal ("v1.2"), not a sentence.
  const ends = /[.!?][)"'\]*_~]*(?=\s|$)/g;
  let cut = -1;
  let match;
  while ((match = ends.exec(head)) !== null) {
    if (!/[0-9]/.test(text[match.index - 1] || "")) cut = ends.lastIndex;
  }

  // A sentence break only counts if it lands late enough in the budget;
  // otherwise trail off at a word boundary instead.
  if (cut < budget * 0.2) cut = head.lastIndexOf(" ");
  if (cut <= 0) cut = head.length;

  text = `${text.slice(0, cut).trim()} …`;
}

// Word-wrap so the terminal's own column wrap never splits a word mid-line.
const lines = [];
let line = "";
for (const word of text.split(" ")) {
  if (line && line.length + 1 + word.length > width) {
    lines.push(line);
    line = word;
  } else {
    line = line ? `${line} ${word}` : word;
  }
}
if (line) lines.push(line);

process.stdout.write(`${lines.join("\n")}\n`);
