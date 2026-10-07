#!/usr/bin/env node
// homie — UserPromptSubmit hook: tracks which homie level is active.
// Inspects user input for /homie commands and writes the level to the flag.

const { getDefaultLevel, writeDefaultLevel, isDeactivationCommand } = require('./homie-config');
const {
  readLevel,
  setLevel,
  writeHookOutput,
} = require('./homie-runtime');
const { getHomieInstructions } = require('./homie-instructions');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /homie commands
    let levelSwitched = false;
    let deactivated = false;
    if (/^[/@$]homie/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/');
      const arg = parts[1] || '';

      let level = null;
      let isReportOnly = false;

      if (cmd === '/homie' || cmd === '/homie:homie') {
        // `/homie default <level>` persists the default to config (survives
        // restarts). Plain switches stay session-scoped, so this is the only
        // path that writes config.
        if (arg === 'default') {
          const dlevel = parts[2];
          if (dlevel === 'off' || dlevel === 'yo' || dlevel === 'dawg' || dlevel === 'mafa') {
            writeDefaultLevel(dlevel);
            writeHookOutput('UserPromptSubmit', dlevel,
              'HOMIE DEFAULT SET — new sessions start in ' + dlevel + '.');
          }
          return; // don't fall through to the session-level switch
        }
        if (arg === 'yo') level = 'yo';
        else if (arg === 'dawg') level = 'dawg';
        else if (arg === 'mafa') level = 'mafa';
        else if (arg === 'off') level = 'off';
        else if (arg === '') {
          // Bare /homie: already on → keep the level, report it; off → turn
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
          'HOMIE MODE ACTIVE — level: ' + level,
        );
      } else if (level && level !== 'off') {
        setLevel(level);
        levelSwitched = true;
        // Deliver the new level's ruleset along with the confirmation so the
        // switch turn itself is already in voice.
        const header = 'HOMIE MODE CHANGED — level: ' + level;
        writeHookOutput('UserPromptSubmit', level, header + '\n\n' + getHomieInstructions(level));
      } else if (level === 'off') {
        // Persist `off` like any level (plan lesson #7): clearing the flag
        // races the default logic — an absent flag reads as the default level.
        setLevel('off');
        deactivated = true;
        writeHookOutput('UserPromptSubmit', 'off', 'HOMIE MODE OFF');
      }
    }

    // Detect deactivation ("stop homie" as a whole message)
    if (!levelSwitched && !deactivated && isDeactivationCommand(prompt)) {
      setLevel('off');
      deactivated = true;
      writeHookOutput('UserPromptSubmit', 'off', 'HOMIE MODE OFF');
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