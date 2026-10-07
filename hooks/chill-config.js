#!/usr/bin/env node
// chill — shared configuration resolver
//
// Resolution order for the default level:
//   1. CHILL_DEFAULT_LEVEL environment variable
//   2. Config file defaultLevel field:
//      - $XDG_CONFIG_HOME/chill/config.json (any platform, if set)
//      - ~/.config/chill/config.json (macOS / Linux fallback)
//      - %APPDATA%\chill\config.json (Windows fallback)
//   3. 'yo'
//
// Bare /chill always activates at yo (per SKILL.md); the configured default
// governs what a NEW SESSION starts at.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_LEVEL = 'yo';
const RUNTIME_LEVELS = ['off', 'yo', 'dawg', 'mafa'];

function normalizeLevel(level) {
  if (typeof level !== 'string') return null;
  const normalized = level.trim().toLowerCase();
  return RUNTIME_LEVELS.includes(normalized) ? normalized : null;
}

// "stop chill" turns chill off, but only as a standalone message. Matching the
// phrase anywhere in the prompt turned it off mid-task for ordinary requests
// like "add a stop chill button" — so require the whole message, ignoring case
// and trailing punctuation.
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return t === 'stop chill' || t === 'chill off';
}

// Only embed paths in a statusline shell command when they're made of ordinary
// path characters. An allowlist beats escaping every shell's metacharacters.
function isShellSafe(p) {
  return typeof p === 'string' && /^[A-Za-z0-9 _.\-:/\\~]+$/.test(p);
}

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'chill');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'chill'
    );
  }
  return path.join(os.homedir(), '.config', 'chill');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function readConfig() {
  try {
    // Strip UTF-8 BOM (common on Windows-saved files) so JSON.parse doesn't choke
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return {};
  }
}

function getDefaultLevel() {
  // 1. Environment variable (highest priority)
  const envLevel = normalizeLevel(process.env.CHILL_DEFAULT_LEVEL);
  if (envLevel) return envLevel;

  // 2. Config file
  const configLevel = normalizeLevel(readConfig().defaultLevel);
  if (configLevel) return configLevel;

  // 3. Default
  return DEFAULT_LEVEL;
}

function writeDefaultLevel(level) {
  const normalized = normalizeLevel(level);
  if (!normalized) return null;

  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let config = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed;
  } catch (e) { /* start fresh */ }
  config.defaultLevel = normalized;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

module.exports = {
  DEFAULT_LEVEL,
  RUNTIME_LEVELS,
  normalizeLevel,
  getDefaultLevel,
  getConfigDir,
  getConfigPath,
  isDeactivationCommand,
  isShellSafe,
  writeDefaultLevel,
};