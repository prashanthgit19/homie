# Install

Pick your agent below. Not listed? Most agents read [`AGENTS.md`](AGENTS.md):
copy it into your project, or ask your agent to install
[`skills/homie/SKILL.md`](skills/homie/SKILL.md) as a skill.

The Claude Code and Codex plugins run two tiny Node.js lifecycle hooks, so
`node` needs to be on your PATH. If it isn't, the skill still works, but every
hook call shows a harmless `node: command not found` error.

## Claude Code

```
/plugin marketplace add prashanthgit19/homie
```
```
/plugin install homie@homie
```

(You have to send two separate prompts for the install to work)

Same steps in the Claude Code Desktop app's Code tab: type the two `/plugin`
commands above into the prompt box.

## OpenCode

```bash
opencode plugin add @kpnpm/homie
```

Or add it to a project's `opencode.json`:

```json
{ "plugins": ["@kpnpm/homie"] }
```

From a checkout instead (the plugin reuses `hooks/` and `skills/`):

```json
{ "plugins": ["./.opencode/plugins"] }
```

The `./` path resolves against your project's `opencode.json`; to share one
checkout across projects, point it at the absolute path of the checkout's
`.opencode/plugins` directory. A `plugins` entry must name a **directory**,
not a file.

## Codex

```bash
codex plugin marketplace add prashanthgit19/homie
codex plugin add homie@homie
```

Run `codex` and open `/hooks`, review and trust its two lifecycle hooks, and
start a new thread.

## Pi (pi.dev)

```bash
pi install npm:@kpnpm/homie
```

or from git:

```bash
pi install git:github.com/prashanthgit19/homie
```

Start `pi` in your project. The extension registers `/homie`, injects the
ruleset into the system prompt before every model call, and shows the active
level in the status bar (`homie: dawg`). Levels are stored in session entries,
so they are scoped to the session and follow branch navigation; a new session
starts at your configured default.

The same extension runs under **Oh My Pi** (`omp`), which executes Pi
extensions unchanged.

## Skills CLI

The [skills CLI](https://skills.sh) copies the skill into the skills folder of
many agents from one command:

```bash
npx skills add prashanthgit19/homie
```

Add `--global` to install for your user instead of the project, and
`--agent <name>` to pick the agent (`claude-code`, `codex`, `opencode`,
`cursor`, `windsurf`, `cline`, `gemini`, and others). This installs the skill
only; for the always-on ruleset, also add [`AGENTS.md`](AGENTS.md) or use one of
the plugins above.

## Any other agent (rules file only)

Cursor, Windsurf, Cline, Aider, Zed, and friends: copy [`AGENTS.md`](AGENTS.md)
into your project root (or your agent's rules directory):

- Cursor: `.cursor/rules/homie.mdc` (or keep `AGENTS.md` at root)
- Windsurf: `.windsurf/rules/`
- Cline: `.clinerules/`
- Aider / Zed / Amp / Jules: read `AGENTS.md` as-is

This keeps the voice on always, at the level described in the file; without
hooks there are no `/homie` level switches or the statusline badge.

## Settings

Default level for every new session:

- env: `HOMIE_DEFAULT_LEVEL=off|yo|dawg|mafa`
- or `~/.config/homie/config.json` (`%APPDATA%\homie\config.json` on Windows):

```json
{ "defaultLevel": "dawg" }
```

Built-in default is **dawg**. Set `yo` for the clean, no-profanity voice.
`/homie default <level>` writes this for you.

## Statusline badge (Claude Code)

The plugin includes statusline scripts showing the active level:
`[HOMIE]` (yo), `[HOMIE:DAWG]`, `[HOMIE:MAFA]`, nothing when off. On first
session start the plugin notices the badge isn't configured and offers to set
it up; accept and it adds to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "bash \"$HOME/.claude/homie-statusline.sh\"" }
```

The script is copied to your config dir so it survives plugin updates.

## Uninstall

| Host | Command |
|------|---------|
| Claude Code | `/plugin remove homie` |
| Codex | `codex plugin remove homie` |
| Pi | `pi remove homie` |
| OpenCode | `opencode plugin remove @kpnpm/homie` |
| Rules file | Delete the copied file |

These remove the plugin's own files. Left behind (harmless): the level flag
(`~/.claude/.homie-active` or `~/.config/opencode/.homie-active`),
`~/.config/homie/config.json`, the statusline script copy, the
`statusLine` entry in `~/.claude/settings.json`, and the
`.homie-statusline-nudged` flag. Remove those by hand if you want a clean
sweep.