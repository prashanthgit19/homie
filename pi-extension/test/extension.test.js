import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import homieExtension from "../index.js";

// Minimal stand-in for Pi's ExtensionAPI: record everything the factory wires
// up so tests can invoke handlers directly.
function createPiHarness() {
  const events = new Map();
  const commands = new Map();
  const appendedEntries = [];

  const pi = {
    on(eventName, handler) {
      events.set(eventName, handler);
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    appendEntry(customType, data) {
      appendedEntries.push({ customType, data });
    },
  };

  homieExtension(pi);
  return { events, commands, appendedEntries };
}

function createCommandContext(overrides = {}) {
  const notifications = [];
  const statusWrites = [];
  const ctx = {
    sessionManager: { getEntries: () => [] },
    ui: {
      notify: (text, type) => notifications.push({ text, type }),
      setStatus: (key, text) => statusWrites.push({ key, text }),
    },
    notifications,
    statusWrites,
    ...overrides,
  };
  return ctx;
}

// Isolate config so writeDefaultLevel never touches the real ~/.config/homie.
function withTempConfig(fn) {
  const tempHome = mkdtempSync(join(tmpdir(), "homie-pi-ext-"));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousDefault = process.env.HOMIE_DEFAULT_LEVEL;
  process.env.XDG_CONFIG_HOME = tempHome;
  delete process.env.HOMIE_DEFAULT_LEVEL;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previousXdg;
      if (previousDefault === undefined) delete process.env.HOMIE_DEFAULT_LEVEL;
      else process.env.HOMIE_DEFAULT_LEVEL = previousDefault;
      rmSync(tempHome, { recursive: true, force: true });
    });
}

test("extension registers only the /homie command", () => {
  const { commands } = createPiHarness();
  assert.deepEqual([...commands.keys()], ["homie"]);
  assert.match(commands.get("homie").description, /off\|yo\|dawg\|mafa/);
});

test("/homie <level> replies one plain line and persists a session entry", async () => {
  await withTempConfig(async () => {
    const { commands, appendedEntries } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("mafa", ctx);

    assert.deepEqual(appendedEntries.at(-1), {
      customType: "homie-mode",
      data: { level: "mafa" },
    });
    assert.equal(ctx.notifications.length, 1);
    const [note] = ctx.notifications;
    assert.equal(note.text, "Aight, mafa mode. No mercy.");
    // The visible reply must never carry the ruleset — that travels through
    // before_agent_start only.
    assert.ok(!note.text.includes("# Homie"));
    assert.ok(!note.text.includes("HOMIE MODE ACTIVE"));
    assert.ok(!note.text.includes("## "));
  });
});

test("/homie off replies one plain line and clears the status entry", async () => {
  await withTempConfig(async () => {
    const { commands } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("off", ctx);

    assert.equal(ctx.notifications.at(-1).text, "Homie off. Back to normal.");
    assert.deepEqual(ctx.statusWrites.at(-1), { key: "homie", text: undefined });
  });
});

test("bare /homie activates at the configured default when off", async () => {
  await withTempConfig(async () => {
    process.env.HOMIE_DEFAULT_LEVEL = "mafa";
    const { commands, appendedEntries } = createPiHarness();
    const ctx = createCommandContext();

    // Turn off, then a bare command must come back at the configured default.
    await commands.get("homie").handler("off", ctx);
    await commands.get("homie").handler("", ctx);

    assert.equal(appendedEntries.at(-1).data.level, "mafa");
    assert.equal(ctx.notifications.at(-1).text, "Aight, mafa mode. No mercy.");
  });
});

test("bare /homie with an off default falls back to the built-in dawg", async () => {
  await withTempConfig(async () => {
    process.env.HOMIE_DEFAULT_LEVEL = "off";
    const { commands, appendedEntries } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("off", ctx);
    await commands.get("homie").handler("", ctx);

    assert.equal(appendedEntries.at(-1).data.level, "dawg");
  });
});

test("bare /homie while active reports the level, changes nothing", async () => {
  await withTempConfig(async () => {
    const { commands, appendedEntries } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("dawg", ctx);
    const before = appendedEntries.length;
    await commands.get("homie").handler("", ctx);

    assert.equal(ctx.notifications.at(-1).text, "Homie mode: dawg.");
    assert.equal(appendedEntries.length, before, "report must not append a mode entry");
  });
});

test("/homie status reports current and default", async () => {
  await withTempConfig(async () => {
    const { commands } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("mafa", ctx);
    await commands.get("homie").handler("status", ctx);

    assert.equal(ctx.notifications.at(-1).text, "Homie: current mafa • default dawg");
  });
});

test("/homie default writes config and replies one line", async () => {
  await withTempConfig(async () => {
    const { commands } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("default mafa", ctx);

    assert.equal(
      ctx.notifications.at(-1).text,
      "Homie default set: mafa. New sessions start at mafa.",
    );
  });
});

test("unknown level and unknown default reply one line, nothing persisted", async () => {
  await withTempConfig(async () => {
    const { commands, appendedEntries } = createPiHarness();
    const ctx = createCommandContext();

    await commands.get("homie").handler("banana", ctx);
    assert.equal(ctx.notifications.at(-1).text, 'Unknown level "banana". Levels: off, yo, dawg, mafa.');
    assert.equal(appendedEntries.length, 0);

    await commands.get("homie").handler("default banana", ctx);
    assert.equal(
      ctx.notifications.at(-1).text,
      "Usage: /homie default <level>. Levels: off, yo, dawg, mafa.",
    );
    assert.equal(appendedEntries.length, 0);
  });
});

test("before_agent_start injects the ruleset as a string and guards a missing prompt", async () => {
  await withTempConfig(async () => {
    const { commands, events } = createPiHarness();
    const ctx = createCommandContext();
    await commands.get("homie").handler("dawg", ctx);

    // #439: a null/undefined event must not crash and must still inject.
    for (const bad of [undefined, null]) {
      const result = await events.get("before_agent_start")(bad, ctx);
      assert.ok(result.systemPrompt.includes("HOMIE MODE ACTIVE — level: dawg"));
      assert.ok(!result.systemPrompt.includes("undefined"));
    }

    // #440: no systemPrompt must not prepend the literal "undefined".
    const empty = await events.get("before_agent_start")({}, ctx);
    assert.ok(empty.systemPrompt.startsWith("HOMIE MODE ACTIVE"));
    assert.ok(!empty.systemPrompt.startsWith("undefined"));

    // A real base prompt is preserved and prepended.
    const withBase = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(withBase.systemPrompt.startsWith("BASE\n\n"));
    assert.ok(withBase.systemPrompt.includes("HOMIE MODE ACTIVE — level: dawg"));
  });
});

test("before_agent_start keeps OMP prompt parts and uses Pi sections (#776, #953)", async () => {
  await withTempConfig(async () => {
    const { commands, events } = createPiHarness();
    const ctx = createCommandContext();
    await commands.get("homie").handler("mafa", ctx);

    // OMP: systemPrompt is an array of parts; they must stay separate.
    const omp = await events.get("before_agent_start")({ systemPrompt: ["A", "B"] }, ctx);
    assert.deepEqual(omp.systemPrompt.slice(0, 2), ["A", "B"]);
    assert.match(omp.systemPrompt[2], /HOMIE MODE ACTIVE — level: mafa/);

    // Pi >= 0.86: write a section and leave the prompt alone; off deletes it.
    const event = { systemPrompt: "BASE", systemPromptOptions: { sections: {} } };
    assert.equal(await events.get("before_agent_start")(event, ctx), undefined);
    assert.match(event.systemPromptOptions.sections.homie, /HOMIE MODE ACTIVE/);
    await commands.get("homie").handler("off", ctx);
    await events.get("before_agent_start")(event, ctx);
    assert.equal(event.systemPromptOptions.sections.homie, undefined);
  });
});

test("off injects nothing and never resurrects a stale section", async () => {
  await withTempConfig(async () => {
    const { commands, events } = createPiHarness();
    const ctx = createCommandContext();
    const event = { systemPrompt: "BASE", systemPromptOptions: { sections: {} } };

    // Start off (default is yo, so set off explicitly).
    await commands.get("homie").handler("off", ctx);
    const result = await events.get("before_agent_start")(event, ctx);
    assert.equal(result, undefined);
    assert.equal(event.systemPromptOptions.sections.homie, undefined);

    const stringResult = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.equal(stringResult, undefined);
  });
});

test("session_start adopts the configured default and notifies one line", async () => {
  await withTempConfig(async () => {
    process.env.HOMIE_DEFAULT_LEVEL = "dawg";
    const { events } = createPiHarness();
    const ctx = createCommandContext();

    await events.get("session_start")({ reason: "startup" }, ctx);

    assert.equal(ctx.notifications.at(-1).text, "Homie loaded: dawg");
    const result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("level: dawg"));
  });
});

test("session_start restores the latest persisted level over the default", async () => {
  await withTempConfig(async () => {
    const { events } = createPiHarness();
    const ctx = createCommandContext({
      sessionManager: {
        getEntries: () => [
          { type: "custom", customType: "homie-mode", data: { level: "mafa" } },
        ],
      },
    });

    await events.get("session_start")({ reason: "resume" }, ctx);

    assert.equal(ctx.notifications.at(-1).text, "Homie loaded: mafa");
    const result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("level: mafa"));
  });
});

test("session_tree re-derives the level from the active branch without persisting", async () => {
  await withTempConfig(async () => {
    const { events, appendedEntries } = createPiHarness();
    const yo = { type: "custom", customType: "homie-mode", data: { level: "yo" } };
    const off = { type: "custom", customType: "homie-mode", data: { level: "off" } };
    let branch = [yo, off];
    const ctx = createCommandContext({
      sessionManager: { getBranch: () => branch, getEntries: () => [yo, off] },
    });

    await events.get("session_start")({ reason: "resume" }, ctx);
    const notificationCount = ctx.notifications.length;

    branch = [yo];
    await events.get("session_tree")({ type: "session_tree" }, ctx);
    let result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("level: yo"));

    branch = [];
    await events.get("session_tree")({ type: "session_tree" }, ctx);
    result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("level: dawg"), "empty branch falls back to the default");

    assert.deepEqual(appendedEntries, [], "navigation must not append a mode entry");
    assert.equal(ctx.notifications.length, notificationCount, "navigation must not re-notify");
  });
});

test("plain 'stop homie' / 'homie off' deactivates, and only as a whole message", async () => {
  await withTempConfig(async () => {
    const { commands, events } = createPiHarness();
    const ctx = createCommandContext();

    // Whole-message "stop homie" deactivates.
    await commands.get("homie").handler("mafa", ctx);
    await events.get("input")({ text: "stop homie", source: "interactive" }, ctx);
    assert.equal(ctx.notifications.at(-1).text, "Homie off. Back to normal.");
    let result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.equal(result, undefined);

    // A sentence that merely mentions the phrase must NOT deactivate.
    await commands.get("homie").handler("mafa", ctx);
    await events.get("input")(
      { text: "add a stop homie button please", source: "interactive" },
      ctx,
    );
    result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("HOMIE MODE ACTIVE"), "mention must not deactivate");

    // Whole-message "homie off" also deactivates.
    await events.get("input")({ text: "homie off", source: "interactive" }, ctx);
    result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.equal(result, undefined);
  });
});

test("input from the extension itself is ignored", async () => {
  await withTempConfig(async () => {
    const { events } = createPiHarness();
    const ctx = createCommandContext();
    await events.get("session_start")({ reason: "startup" }, ctx);

    await events.get("input")({ text: "stop homie", source: "extension" }, ctx);

    // Still active — the extension's own message must not turn it off.
    const result = await events.get("before_agent_start")({ systemPrompt: "BASE" }, ctx);
    assert.ok(result.systemPrompt.includes("HOMIE MODE ACTIVE"));
  });
});

test("status bar shows plain text and updates on level change", async () => {
  await withTempConfig(async () => {
    const { commands, events } = createPiHarness();
    const ctx = createCommandContext({
      sessionManager: {
        getEntries: () => [{ type: "custom", customType: "homie-mode", data: { level: "dawg" } }],
      },
    });

    await events.get("session_start")({ reason: "resume" }, ctx);
    assert.deepEqual(ctx.statusWrites.at(-1), { key: "homie", text: "homie: dawg" });
    // No icons/emoji anywhere in the badge.
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ctx.statusWrites.at(-1).text));

    await commands.get("homie").handler("mafa", ctx);
    assert.deepEqual(ctx.statusWrites.at(-1), { key: "homie", text: "homie: mafa" });
  });
});
