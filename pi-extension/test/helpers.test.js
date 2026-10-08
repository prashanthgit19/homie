import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseHomieCommand,
  readDefaultLevel,
  resolveSessionLevel,
  writeDefaultLevel,
} from "../index.js";

test("parseHomieCommand activates bare at yo when off", () => {
  assert.deepEqual(parseHomieCommand("", "off"), { type: "set-level", level: "yo" });
  assert.deepEqual(parseHomieCommand("", null), { type: "set-level", level: "yo" });
});

test("parseHomieCommand reports instead of resetting when already active", () => {
  assert.deepEqual(parseHomieCommand("", "yo", "mafa"), { type: "report" });
  assert.deepEqual(parseHomieCommand("", "yo", "dawg"), { type: "report" });
});

test("parseHomieCommand parses levels, status, and default subcommand", () => {
  assert.deepEqual(parseHomieCommand("dawg"), { type: "set-level", level: "dawg" });
  assert.deepEqual(parseHomieCommand("off"), { type: "set-level", level: "off" });
  assert.deepEqual(parseHomieCommand("status"), { type: "status" });
  assert.deepEqual(parseHomieCommand("default mafa"), { type: "set-default", level: "mafa" });
  // Case- and whitespace-insensitive
  assert.deepEqual(parseHomieCommand("  MAFA  "), { type: "set-level", level: "mafa" });
  assert.deepEqual(parseHomieCommand("DEFAULT Dawg"), { type: "set-default", level: "dawg" });
});

test("parseHomieCommand rejects unknown levels and defaults", () => {
  assert.deepEqual(parseHomieCommand("banana"), {
    type: "invalid",
    reason: "invalid-level",
    level: "banana",
  });
  assert.deepEqual(parseHomieCommand("default banana"), {
    type: "invalid",
    reason: "invalid-default-level",
    level: "banana",
  });
  // No argument after `default` is invalid too
  assert.deepEqual(parseHomieCommand("default"), {
    type: "invalid",
    reason: "invalid-default-level",
    level: undefined,
  });
});

test("resolveSessionLevel prefers the newest persisted entry", () => {
  const entries = [
    { type: "custom", customType: "homie-mode", data: { level: "yo" } },
    { type: "custom", customType: "homie-mode", data: { level: "mafa" } },
  ];
  assert.equal(resolveSessionLevel(entries, "yo"), "mafa");
});

test("resolveSessionLevel ignores foreign and malformed entries", () => {
  const entries = [
    { type: "custom", customType: "other", data: { level: "mafa" } },
    { type: "text", customType: "homie-mode", data: { level: "mafa" } },
    { type: "custom", customType: "homie-mode", data: { level: "banana" } },
    { type: "custom", customType: "homie-mode", data: {} },
    { type: "custom", customType: "homie-mode", data: { level: "dawg" } },
  ];
  assert.equal(resolveSessionLevel(entries, "yo"), "dawg");
});

test("resolveSessionLevel honors off and falls back on junk input", () => {
  const off = [{ type: "custom", customType: "homie-mode", data: { level: "off" } }];
  assert.equal(resolveSessionLevel(off, "yo"), "off");
  assert.equal(resolveSessionLevel(null, "mafa"), "mafa");
  assert.equal(resolveSessionLevel(undefined, "dawg"), "dawg");
  assert.equal(resolveSessionLevel({}, "yo"), "yo");
  assert.equal(resolveSessionLevel("not an array", "yo"), "yo");
  // An unrecognized fallback degrades to the built-in default, never a bogus level.
  assert.equal(resolveSessionLevel([], "banana"), "yo");
});

test("readDefaultLevel and writeDefaultLevel use the XDG config path", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "homie-pi-config-"));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousDefault = process.env.HOMIE_DEFAULT_LEVEL;
  const configPath = join(tempHome, "homie", "config.json");
  process.env.XDG_CONFIG_HOME = tempHome;
  delete process.env.HOMIE_DEFAULT_LEVEL;

  try {
    assert.equal(readDefaultLevel(), "yo");
    assert.equal(writeDefaultLevel("mafa"), "mafa");
    assert.equal(readDefaultLevel(), "mafa");
    assert.ok(existsSync(configPath));
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { defaultLevel: "mafa" });
    // Invalid default is rejected and leaves the config untouched.
    assert.equal(writeDefaultLevel("banana"), null);
    assert.equal(readDefaultLevel(), "mafa");
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousDefault === undefined) delete process.env.HOMIE_DEFAULT_LEVEL;
    else process.env.HOMIE_DEFAULT_LEVEL = previousDefault;
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("env HOMIE_DEFAULT_LEVEL overrides the config file", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "homie-pi-env-"));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousDefault = process.env.HOMIE_DEFAULT_LEVEL;
  process.env.XDG_CONFIG_HOME = tempHome;

  try {
    delete process.env.HOMIE_DEFAULT_LEVEL;
    writeDefaultLevel("dawg");
    assert.equal(readDefaultLevel(), "dawg");
    process.env.HOMIE_DEFAULT_LEVEL = "mafa";
    assert.equal(readDefaultLevel(), "mafa");
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousDefault === undefined) delete process.env.HOMIE_DEFAULT_LEVEL;
    else process.env.HOMIE_DEFAULT_LEVEL = previousDefault;
    rmSync(tempHome, { recursive: true, force: true });
  }
});
