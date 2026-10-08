// homie — Pi agent harness extension.
//
// Injects the homie ruleset into the system prompt before every model call
// (off = silence) and registers the /homie command. The level lives in session
// entries, so it is scoped to the session and follows branch navigation; the
// configured default (HOMIE_DEFAULT_LEVEL or ~/.config/homie/config.json)
// governs new sessions.
//
// The ruleset itself is read from ../hooks/, shared with every other homie
// host — no copy, no drift. This file is ESM; the hooks are CommonJS, hence
// the createRequire bridge below.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_LEVEL,
  RUNTIME_LEVELS,
  getDefaultLevel,
  normalizeLevel,
  isDeactivationCommand,
  writeDefaultLevel,
} = require("../hooks/homie-config.js");
const { getHomieInstructions } = require("../hooks/homie-instructions.js");

const LEVEL_LIST = RUNTIME_LEVELS.join("|");
const LEVELS_MESSAGE = RUNTIME_LEVELS.join(", ");
const HOMIE_COMMAND_DESCRIPTION =
  `Set voice level: ${LEVEL_LIST}. Commands: status, default <level>`;

// Parse the argument string of `/homie ...`.
//
// Bare `/homie` turns the voice on at yo when it is off, and reports the
// current level when it is already on — the SKILL.md contract, deliberately
// not the configured default.
export function parseHomieCommand(text, currentLevel = null) {
  const normalized = String(text || "").trim().toLowerCase();

  if (!normalized) {
    if (currentLevel && currentLevel !== "off") return { type: "report" };
    return { type: "set-level", level: "yo" };
  }

  const [primary, secondary] = normalized.split(/\s+/);

  if (primary === "status") return { type: "status" };

  if (primary === "default") {
    const level = normalizeLevel(secondary);
    return level
      ? { type: "set-default", level }
      : { type: "invalid", reason: "invalid-default-level", level: secondary };
  }

  const level = normalizeLevel(primary);
  return level
    ? { type: "set-level", level }
    : { type: "invalid", reason: "invalid-level", level: primary };
}

// Newest homie-mode entry on the active branch wins; otherwise the fallback.
export function resolveSessionLevel(entries, fallbackLevel = DEFAULT_LEVEL) {
  const fallback = normalizeLevel(fallbackLevel) || DEFAULT_LEVEL;
  if (!Array.isArray(entries)) return fallback;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry?.customType !== "homie-mode") continue;
    const level = normalizeLevel(entry?.data?.level);
    if (level) return level;
  }
  return fallback;
}

export { writeDefaultLevel };
export const readDefaultLevel = getDefaultLevel;

export default function homieExtension(pi) {
  let currentLevel = DEFAULT_LEVEL;
  let configuredDefault = getDefaultLevel();
  let lastCtx = null;

  function syncStatus(ctx) {
    if (ctx) lastCtx = ctx;
    const c = ctx || lastCtx;
    if (!c?.ui?.setStatus) return;
    // Plain text, no icons: "homie: dawg". Cleared when off.
    c.ui.setStatus("homie", currentLevel === "off" ? undefined : `homie: ${currentLevel}`);
  }

  const setLevel = (level, ctx) => {
    const normalized = normalizeLevel(level);
    if (!normalized) return;
    currentLevel = normalized;
    pi.appendEntry("homie-mode", { level: normalized });
    syncStatus(ctx);
  };

  const notify = (ctx, message, type = "info") => ctx?.ui?.notify?.(message, type);

  pi.registerCommand("homie", {
    description: HOMIE_COMMAND_DESCRIPTION,
    handler: async (args, ctx) => {
      const parsed = parseHomieCommand(args, currentLevel);

      if (parsed.type === "status") {
        notify(ctx, `Homie: current ${currentLevel} • default ${configuredDefault}`);
        return;
      }

      if (parsed.type === "report") {
        // Bare /homie while active: report the level, change nothing.
        notify(ctx, `Homie mode: ${currentLevel}.`);
        return;
      }

      if (parsed.type === "set-default") {
        try {
          const written = writeDefaultLevel(parsed.level);
          if (!written) return;
          configuredDefault = getDefaultLevel();
          notify(
            ctx,
            configuredDefault === written
              ? `Homie default set: ${written}. New sessions start at ${written}.`
              : `Saved default ${written}, but HOMIE_DEFAULT_LEVEL keeps default at ${configuredDefault}.`,
          );
        } catch (e) {
          notify(ctx, `Failed to save default: ${e.message}`, "error");
        }
        return;
      }

      if (parsed.type === "set-level") {
        setLevel(parsed.level, ctx);
        notify(ctx, currentLevel === "off" ? "Homie off." : `Homie mode: ${currentLevel}.`);
        return;
      }

      // invalid
      if (parsed.reason === "invalid-default-level") {
        notify(ctx, `Usage: /homie default <level>. Levels: ${LEVELS_MESSAGE}.`, "warning");
      } else {
        notify(ctx, `Unknown level "${parsed.level}". Levels: ${LEVELS_MESSAGE}.`, "warning");
      }
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event?.source === "extension") return;
    const text = String(event?.text || "");
    if (currentLevel !== "off" && isDeactivationCommand(text)) {
      setLevel("off", ctx);
      notify(ctx, "Homie off.");
    }
  });

  const restoreSessionLevel = (ctx) => {
    const entries =
      ctx?.sessionManager?.getBranch?.() ||
      ctx?.sessionManager?.getEntries?.() ||
      [];
    currentLevel = resolveSessionLevel(entries, configuredDefault);
    syncStatus(ctx);
  };

  pi.on("session_start", async (_event, ctx) => {
    configuredDefault = getDefaultLevel();
    restoreSessionLevel(ctx);
    notify(ctx, `Homie loaded: ${currentLevel}`);
  });

  // Branch navigation is a new view of history: re-derive the level from the
  // active branch rather than assuming the previous one still applies.
  pi.on("session_tree", async (_event, ctx) => {
    restoreSessionLevel(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (!currentLevel || currentLevel === "off") {
      // Clear a stale section so a previous turn's voice does not linger.
      if (event?.systemPromptOptions?.sections) {
        delete event.systemPromptOptions.sections.homie;
      }
      return;
    }

    const instructions = getHomieInstructions(currentLevel);

    // Prefer structured sections so Pi can keep its cached prefix when other
    // extensions change their own section. Fall back to the array form (omp)
    // and then to replacing the system prompt, guarding a null/missing prompt
    // so the literal string "undefined" is never prepended.
    const sections = event?.systemPromptOptions?.sections;
    if (sections && typeof sections === "object") {
      sections.homie = instructions;
      return;
    }
    if (Array.isArray(event?.systemPrompt)) {
      return { systemPrompt: [...event.systemPrompt, instructions] };
    }
    const base = event?.systemPrompt ? `${event.systemPrompt}\n\n` : "";
    return { systemPrompt: `${base}${instructions}` };
  });
}
