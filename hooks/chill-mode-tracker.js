#!/usr/bin/env node
// chill — UserPromptSubmit hook: tracks which chill level is active.
// Inspects user input for /chill commands and writes the level to the flag.

const { getDefaultLevel, writeDefaultLevel, isDeactivationCommand } = require('./chill-config');
const {
  readLevel,
  setLevel,
  clearLevel,
  writeHookOutput,
} = require('./chill-runtime');
const { getChillInstructions } = require('./chill-instructions');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /chill commands
    let levelSwitched = false;
    let deactivated = false;
    if (/^[/@$]chill/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/');
      const arg = parts[1] || '';

      let level = null;
      let isReportOnly = false;

      if (cmd === '/chill' || cmd === '/chill:chill') {
        // `/chill default <level>` persists the default to config (survives
        // restarts). Plain switches stay session-scoped, so this is the only
        // path that writes config.
        if (arg === 'default') {
          const dlevel = parts[2];
          if (dlevel === 'off' || dlevel === 'yo' || dlevel === 'dawg' || dlevel === 'mafa') {
            writeDefaultLevel(dlevel);
            writeHookOutput('UserPromptSubmit', dlevel,
              'CHILL DEFAULT SET — new sessions start in ' + dlevel + '.');
          }
          return; // don't fall through to the session-level switch
        }
        if (arg === 'yo') level = 'yo';
        else if (arg === 'dawg') level = 'dawg';
        else if (arg === 'mafa') level = 'mafa';
        else if (arg === 'off') level = 'off';
        else if (arg === '') {
          // Bare /chill: already on → keep the level, report it; off → turn
          // on at yo (bare activation is specified as yo in SKILL.md).
          const live = readLevel();
          if (live && live !== 'off') {
            isReportOnly = true;
            level = live;
          } else {
            level = 'yo';
          }
        }
      }

      if (isReportOnly) {
        writeHookOutput(
          'UserPromptSubmit',
          level,
          'CHILL MODE ACTIVE — level: ' + level,
        );
      } else if (level && level !== 'off') {
        setLevel(level);
        levelSwitched = true;
        // Deliver the new level's ruleset along with the confirmation so the
        // switch turn itself is already in voice.
        const header = 'CHILL MODE CHANGED — level: ' + level;
        writeHookOutput('UserPromptSubmit', level, header + '\n\n' + getChillInstructions(level));
      } else if (level === 'off') {
        // Persist `off` like any level (plan lesson #7): clearing the flag
        // races the default logic — an absent flag reads as the default level.
        setLevel('off');
        deactivated = true;
        writeHookOutput('UserPromptSubmit', 'off', 'CHILL MODE OFF');
      }
    }

    // Detect deactivation ("stop chill" as a whole message)
    if (!levelSwitched && !deactivated && isDeactivationCommand(prompt)) {
      setLevel('off');
      deactivated = true;
      writeHookOutput('UserPromptSubmit', 'off', 'CHILL MODE OFF');
    }
  } catch (e) {
    // Silent fail
  }
}

process.stdin.on('data', chunk => { input += chunk; });
// Exit on 'end', not just finish(): the fallback timer below must stay ref'd
// so it can actually fire when stdin is stuck, and a ref'd timer would
// otherwise keep the process alive for its full 1000ms on the fast path.
process.stdin.on('end', () => { finish(); process.exit(0); });

// Never hang the session. On Windows, hooks can be run through a PowerShell
// wrapper that swallows the piped prompt JSON, so stdin 'end' never fires and
// the hook blocks. On error, or after a short fallback, process whatever
// arrived and exit. The fallback timer MUST stay ref'd: a stuck ref'd stdin
// handle keeps the event loop alive, and an unref'd timer competing with it
// is never scheduled.
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000);