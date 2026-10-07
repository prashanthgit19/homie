// chill — OpenCode V2 plugin.
//
// Injects the chill personality into every model call's system context at the
// active level, persists /chill level switches, registers the /chill command
// and skill. Reuses the shared instruction builder so Claude Code, Codex, and
// OpenCode all read one source of truth.
//
// Add to your opencode.json:
//   { "plugins": ["@prashanthgit19/chill"] }
// Or run: opencode plugin add @prashanthgit19/chill

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The shared instruction builder is CommonJS; bridge to it from this ES module.
const require = createRequire(import.meta.url);
const { getChillInstructions } = require('../../hooks/chill-instructions');
const { getDefaultLevel, normalizeLevel } = require('../../hooks/chill-config');

// OpenCode has no flag-file convention of its own; keep the level beside its config.
const statePath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.chill-active',
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

// `off` is persisted like any level; the context hook reads it and stays
// silent. An unrecognized level leaves the current one alone. Bare /chill
// turns the voice on at yo (per SKILL.md); with any level active the command
// just reports — the execute() reply shows the current level.
function persistLevel(args) {
  const wanted = String(args == null ? '' : args).trim();
  if (!wanted && readLevel() !== 'off') return; // bare /chill: report-only when active
  const level = wanted ? normalizeLevel(wanted) : 'yo';
  if (!level) return;
  writeLevel(level);
}

function readSkill() {
  const file = path.resolve(__dirname, '../../skills/chill/SKILL.md');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/, '');
    const nameMatch = raw.match(/^name:\s*(.+)$/m);
    const descMatch = raw.match(/^description:\s*(.+)$/m);
    return {
      id: 'chill',
      name: (nameMatch && nameMatch[1].trim()) || 'chill',
      description: (descMatch && descMatch[1].trim()) || 'Chill personality layer.',
      path: file,
      content: body,
    };
  } catch (e) {
    return null;
  }
}

export default {
  id: 'chill',

  async setup(ctx) {
    const skill = readSkill();

    if (skill) {
      await ctx.skill.transform((editor) => {
        editor.add(skill);
      });
    }

    await ctx.command.transform((editor) => {
      editor.add({
        name: 'chill',
        description: 'Switch personality level (off/yo/dawg/mafa)',
        execute: async ({ sessionID, prompt, delivery }) => {
          persistLevel(prompt.text);
          const level = readLevel();
          const text = level === 'off'
            ? 'Chill is off — back to the normal tone.'
            : 'CHILL MODE — level: ' + level + '.\n\n' + getChillInstructions(level);
          await ctx.session.prompt({ ...prompt, sessionID, text, delivery });
        },
      });
    });

    // Inject the policy into the system context on every model call (agent
    // loop, including tool-driven continuations). off = silence.
    await ctx.session.hook('context', (event) => {
      const level = readLevel();
      if (level === 'off') return;
      event.system.push({ type: 'text', text: getChillInstructions(level) });
    });
  },
};