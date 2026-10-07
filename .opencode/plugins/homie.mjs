// homie — OpenCode V2 plugin.
//
// Registers the /homie command and skill, persists level switches, and
// injects the homie personality into every model call's system context at
// the active level. Command replies are one plain line — the full ruleset
// is delivered invisibly through the context hook, never dumped into chat.
//
// Add to your opencode.json:
//   { "plugins": ["@kpnpm/homie"] }
// Or run: opencode plugin add @kpnpm/homie

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The shared instruction builder is CommonJS; bridge to it from this ES module.
const require = createRequire(import.meta.url);
const { getHomieInstructions } = require('../../hooks/homie-instructions');
const { getDefaultLevel, normalizeLevel, writeDefaultLevel } = require('../../hooks/homie-config');

// OpenCode has no flag-file convention of its own; keep the level beside its config.
const statePath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.homie-active',
);

function readLevel() {
  try {
    return normalizeLevel(fs.readFileSync(statePath, 'utf8').trim()) || getDefaultLevel();
  } catch (e) {
    return getDefaultLevel();
  }
}

function writeLevel(level) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, level);
}

// Returns the applied level, null for an unrecognized level, or undefined
// when nothing changed (bare /homie while already on → report-only).
// `off` is persisted like any level; the context hook reads it and stays
// silent. Bare /homie turns the voice on at yo (per SKILL.md).
function persistLevel(args) {
  const wanted = String(args == null ? '' : args).trim();
  if (!wanted && readLevel() !== 'off') return undefined;
  const level = wanted ? normalizeLevel(wanted) : 'yo';
  if (!level) return null;
  writeLevel(level);
  return level;
}

function readSkill() {
  const file = path.resolve(__dirname, '../../skills/homie/SKILL.md');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/, '');
    const nameMatch = raw.match(/^name:\s*(.+)$/m);
    const descMatch = raw.match(/^description:\s*(.+)$/m);
    return {
      id: 'homie',
      name: (nameMatch && nameMatch[1].trim()) || 'homie',
      description: (descMatch && descMatch[1].trim()) || 'Homie personality layer.',
      path: file,
      content: body,
    };
  } catch (e) {
    return null;
  }
}

export default {
  id: 'homie',

  async setup(ctx) {
    const skill = readSkill();

    if (skill) {
      await ctx.skill.transform((editor) => {
        editor.add(skill);
      });
    }

    await ctx.command.transform((editor) => {
      editor.add({
        name: 'homie',
        description: 'Switch personality level (off/yo/dawg/mafa)',
        execute: async ({ sessionID, prompt, delivery }) => {
          const wanted = String(prompt.text || '').trim();
          const words = wanted.split(/\s+/).filter(Boolean);
          const first = words[0] || '';
          let text;

          if (first === 'default') {
            const applied = words[1] ? writeDefaultLevel(words[1]) : null;
            text = applied
              ? 'Homie default set: ' + applied + '. New sessions start at ' + applied + '.'
              : 'Usage: /homie default <level>. Levels: off, yo, dawg, mafa.';
          } else {
            const applied = persistLevel(first);
            const level = readLevel();
            if (first && applied === null) {
              text = 'Unknown level "' + first + '". Levels: off, yo, dawg, mafa.';
            } else if (level === 'off') {
              text = 'Homie off.';
            } else {
              text = 'Homie mode: ' + level + '.';
            }
          }

          // One plain line only. The context hook below injects the full
          // ruleset into the system context of this same model call, so the
          // confirmation turn is already in voice — without dumping the
          // ruleset into the chat.
          await ctx.session.prompt({ ...prompt, sessionID, text, delivery });
        },
      });
    });

    // Inject the policy into the system context on every model call (agent
    // loop, including tool-driven continuations). off = silence.
    await ctx.session.hook('context', (event) => {
      const level = readLevel();
      if (level === 'off') return;
      event.system.push({ type: 'text', text: getHomieInstructions(level) });
    });
  },
};