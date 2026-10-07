#!/usr/bin/env node
// homie — runtime: flag IO, host detection, hook output shapes.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('crypto');
const { getDefaultLevel, normalizeLevel } = require('./homie-config');

const STATE_FILE = '.homie-active';

// Host detection. Codex sets PLUGIN_DATA; Copilot sets COPILOT_PLUGIN_DATA or
// runs the plugin from under .vscode/agent-plugins/; otherwise native Claude.
function isVsCodeCopilotRoot(pluginRoot) {
  if (!pluginRoot) return false;
  return pluginRoot.split(/[\\/]+/).includes('agent-plugins') &&
    pluginRoot.toLowerCase().includes('.vscode');
}

const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA) ||
  isVsCodeCopilotRoot(process.env.CLAUDE_PLUGIN_ROOT);
const isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA);

function getStateDir() {
  if (isCodex) return process.env.PLUGIN_DATA;
  if (isCopilot) return process.env.COPILOT_PLUGIN_DATA || getClaudeDir();
  return getClaudeDir();
}

function getClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

const stateDir = getStateDir();
const statePath = path.join(stateDir, STATE_FILE);

// Claude Code hands every hook its project dir, so the live level is kept per
// project and concurrent sessions in different repos stop overwriting each
// other. Hosts without it keep the single shared flag.
const projectDir = (process.env.CLAUDE_PROJECT_DIR || '').trim();
// Replacing separators with '_' aliases distinct paths; hash instead.
const projectStatePath = projectDir
  ? path.join(stateDir, 'homie-modes',
    createHash('sha256').update(path.normalize(projectDir)).digest('hex'))
  : null;

// The shared flag is still written, for the statusline and project-less hosts.
function setLevel(level) {
  for (const file of [projectStatePath, statePath]) {
    if (!file) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, level);
  }
}

function clearLevel() {
  for (const file of [projectStatePath, statePath]) {
    if (file) try { fs.unlinkSync(file); } catch (e) {}
  }
}

// Live level written by activate/mode-tracker. Absent flag = default level
// (not off — the default is yo).
function readLevel() {
  try {
    const stored = fs.readFileSync(projectStatePath || statePath, 'utf8').trim();
    return normalizeLevel(stored) || getDefaultLevel();
  } catch (e) {
    return getDefaultLevel();
  }
}

function readSharedLevel() {
  try {
    const stored = fs.readFileSync(statePath, 'utf8').trim();
    return normalizeLevel(stored) || getDefaultLevel();
  } catch (e) {
    return getDefaultLevel();
  }
}

function writeHookOutput(event, level, context = '') {
  if (isCopilot) {
    // Copilot reads additionalContext on SessionStart; ignores output elsewhere.
    process.stdout.write(JSON.stringify(
      event === 'SessionStart' && context ? { additionalContext: context } : {}));
    return;
  }
  if (isCodex) {
    // No systemMessage: Codex maps it to a yellow `warning:` entry. The level
    // still shows via the additionalContext "hook context:" line.
    const output = {};
    if (context) {
      output.hookSpecificOutput = {
        hookEventName: event,
        additionalContext: context,
      };
    }
    process.stdout.write(JSON.stringify(output));
    return;
  }
  // Native Claude Code: raw stdout is injected as context.
  process.stdout.write(context);
}

module.exports = {
  clearLevel,
  isCodex,
  isCopilot,
  readLevel,
  readSharedLevel,
  setLevel,
  writeHookOutput,
  statePath,
  projectStatePath,
  getStateDir,
  getClaudeDir,
};