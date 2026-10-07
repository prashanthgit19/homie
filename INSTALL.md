# Install

Pick your agent below. Not listed? Most agents read [`AGENTS.md`](AGENTS.md):
copy it into your project, or ask your agent to install
[`skills/chill/SKILL.md`](skills/chill/SKILL.md) as a skill.

The Claude Code and Codex plugins run two tiny Node.js lifecycle hooks, so
`node` needs to be on your PATH. If it isn't, the skill still works, but every
hook call shows a harmless `node: command not found` error.

## Claude Code

```
/plugin marketplace add prashanthgit19/chill
```
```
/plugin install chill@chill
```

(You have to send two separate prompts for the install to work)

Same steps in the Claude Code Desktop app's Code tab: type the two `/plugin`
commands above into the prompt box.

## OpenCode

```bash
opencode plugin add @prashanthgit19/chill
```

Or add it to a project's `opencode.json`:

```json
{ "plugins": ["@prashanthgit19/chill"] }
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
codex plugin marketplace add prashanthgit19/chill
codex plugin add chill@chill
```

Run `codex` and open `/hooks`, review and trust its two lifecycle hooks, and
start a new thread.

## Any other agent (rules file only)

Cursor, Windsurf, Cline, Aider, Zed, and friends: copy [`AGENTS.md`](AGENTS.md)
into your project root (or your agent's rules directory):

- Cursor: `.cursor/rules/chill.mdc` (or keep `AGENTS.md` at root)
- Windsurf: `.windsurf/rules/`
- Cline: `.clinerules/`
- Aider / Zed / Amp / Jules: read `AGENTS.md` as-is

This keeps the voice on always, at the level described in the file; without
hooks there are no `/chill` level switches or the statusline badge.

## Settings

Default level for every new session:

- env: `CHILL_DEFAULT_LEVEL=off|yo|dawg|mafa`
- or `~/.config/chill/config.json` (`%APPDATA%\chill\config.json` on Windows):

```json
{ "defaultLevel": "yo" }
```

`/chill default <level>` writes this for you.

## Statusline badge (Claude Code)

The plugin includes statusline scripts showing the active level:
`[CHILL]` (yo), `[CHILL:DAWG]`, `[CHILL:MAFA]`, nothing when off. On first
session start the plugin notices the badge isn't configured and offers to set
it up; accept and it adds to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "bash \"$HOME/.claude/chill-statusline.sh\"" }
```

The script is copied to your config dir so it survives plugin updates.

## Uninstall

| Host | Command |
|------|---------|
| Claude Code | `/plugin remove chill` |
| Codex | `codex plugin remove chill` |
| OpenCode | `opencode plugin remove @prashanthgit19/chill` |
| Rules file | Delete the copied file |

These remove the plugin's own files. Left behind (harmless): the level flag
(`~/.claude/.chill-active` or `~/.config/opencode/.chill-active`),
`~/.config/chill/config.json`, the statusline script copy, the
`statusLine` entry in `~/.claude/settings.json`, and the
`.chill-statusline-nudged` flag. Remove those by hand if you want a clean
sweep.