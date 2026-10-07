#!/usr/bin/env node
// homie — SessionStart activation hook (Claude Code, also Codex and Copilot).
//
// Runs on every session start:
//   1. Resets the live flag to the configured default level
//   2. Emits the homie ruleset as hidden SessionStart context
//   3. Detects missing statusline config and emits a one-shot setup nudge

const fs = require('fs');
const path = require('path');
const { getDefaultLevel, isShellSafe } = require('./homie-config');
const { getHomieInstructions } = require('./homie-instructions');
const {
  setLevel,
  writeHookOutput,
  isCodex,
  isCopilot,
  getClaudeDir,
} = require('./homie-runtime');

const level = getDefaultLevel();

// "off" default — persist off like any level: a stale flag from a previous
// session would otherwise keep the statusline badge showing the old level
// while this session is normal. Stay silent: emitting a notice every session
// is context noise for a plugin that is off.
if (level === 'off') {
  try { setLevel('off'); } catch (e) {}
  process.exit(0);
}

// 1. Reset the live flag to the default (session-scoped semantics).
try {
  setLevel(level);
} catch (e) {
  // Silent fail — flag is best-effort, don't block the hook
}

// 2. Emit the homie ruleset at the default level.
let output = getHomieInstructions(level);

// 3. Detect missing statusline config — nudge Claude to help set it up.
// Codex and Copilot don't read Claude settings.json; skip the nudge there.
if (!isCodex && !isCopilot) try {
  const claudeDir = getClaudeDir();
  const isWindows = process.platform === 'win32';
  const settingsPath = path.join(claudeDir, 'settings.json');

  let statusCommand = null;
  if (fs.existsSync(settingsPath)) {
    // Strip UTF-8 BOM some editors prepend on Windows (breaks JSON.parse)
    const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
    const settings = JSON.parse(raw);
    if (settings.statusLine) {
      statusCommand = String(settings.statusLine.command || '');
    }
  }

  // A statusLine set up before a plugin update can still point at a script in
  // a versioned cache dir that the update deleted. Only absolute paths are
  // checked; on Windows only drive-letter or UNC paths count as absolute.
  const ref = statusCommand &&
    statusCommand.match(/"([^"]*homie-statusline\.(?:sh|ps1))"|(\S*homie-statusline\.(?:sh|ps1))/);
  const refPath = ref ? (ref[1] || ref[2]) : null;
  const checkable = refPath && isShellSafe(refPath) && path.isAbsolute(refPath) &&
    (!isWindows || /^([A-Za-z]:[\\/]|\\\\)/.test(refPath));
  const stalePath = checkable && !fs.existsSync(refPath) ? refPath : null;

  // Point the statusline at a copy in the config dir, which survives plugin
  // updates. Copy to a temp file, then rename: a concurrent session never
  // runs a half-written script.
  const usePs1 = refPath ? refPath.endsWith('.ps1') : isWindows;
  const scriptName = usePs1 ? 'homie-statusline.ps1' : 'homie-statusline.sh';
  const scriptPath = path.join(claudeDir, scriptName);

  // Nudge at most once — the flag file records the user has seen (and
  // implicitly declined) the offer. A broken path is nudged once per path.
  const nudgeFlagPath = path.join(claudeDir, '.homie-statusline-nudged');
  let nudged = null;
  try { nudged = fs.readFileSync(nudgeFlagPath, 'utf8'); } catch (e) { /* not nudged yet */ }
  const nudge = stalePath ? nudged !== stalePath : statusCommand === null && nudged === null;

  // Refresh the copy every session so script fixes ship with plugin updates.
  if (nudge || fs.existsSync(scriptPath)) {
    const tmpPath = scriptPath + '.' + process.pid + '.tmp';
    try {
      fs.copyFileSync(path.join(__dirname, scriptName), tmpPath, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(tmpPath, 0o644);
      fs.renameSync(tmpPath, scriptPath);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (e) { /* renamed */ }
    }
  }

  if (nudge) {
    try { fs.writeFileSync(nudgeFlagPath, stalePath || ''); } catch (e) { /* best-effort */ }
    if (stalePath) {
      output += "\n\n" +
        "STATUSLINE BROKEN: The statusLine in " + settingsPath + " runs " + stalePath +
        ", which no longer exists (the homie plugin was updated and its old version removed), " +
        "so the homie badge is blank. Replace that path with " + scriptPath + ", " +
        "quoting it for your shell. Keep the rest of the command. " +
        "Proactively offer to fix this for the user on first interaction.";
    } else if (isShellSafe(scriptPath)) {
      const command = isWindows
        ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
        : `bash "${scriptPath}"`;
      const statusLineSnippet =
        '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }';
      output += "\n\n" +
        "STATUSLINE SETUP NEEDED: The homie plugin includes a statusline badge showing the active " +
        "level (e.g. [HOMIE], [HOMIE:DAWG], [HOMIE:MAFA]). It is not configured yet. " +
        "To enable, add this to " + settingsPath + ": " +
        statusLineSnippet + " " +
        "Proactively offer to set this up for the user on first interaction.";
    } else {
      output += "\n\n" +
        "STATUSLINE SETUP NEEDED: The homie plugin includes a statusline badge showing the active level. " +
        "Its path contains characters unsafe to embed in a shell command, so configure it manually: " +
        "add a statusLine command of type \"command\" that runs " + scriptName +
        " from " + claudeDir + " to " + settingsPath + ", quoting/escaping the path for your shell. " +
        "Proactively offer to set this up for the user on first interaction.";
    }
  }
} catch (e) {
  // Silent fail — don't block session start over statusline detection
}

try {
  writeHookOutput('SessionStart', level, output);
} catch (e) {
  // Silent fail — stdout closed/EPIPE at hook exit must not surface as a hook failure
}