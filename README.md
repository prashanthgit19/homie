# homie

*Same brain. Same code. Different voice.*

Your coding agent didn't need another corporate assistant. **homie** switches
its chat voice to a technically competent friend — in three levels:

| Level | Voice |
|-------|-------|
| 😌 **yo** | Casual, warm, friendly. Contractions. Light humor. No profanity. |
| 😏 **dawg** | Direct and candid. Challenges weak ideas. Light roasting. Mild swearing (damn, hell, crap), rarely. |
| 💀 **mafa** | Extremely informal technical friend. Slang, sarcasm. Swears only where a real friend would — zero or one per response. |

**Voice only.** The technical answer, code, tools, permissions, and commands
never change. Every level raises the same concerns — yo just says them more
gently. Never lets niceness bury a real issue.

**Voice lives in prose only.** Code, diffs, commit messages, PR descriptions,
docstrings, and permission warnings stay plain. A joke in a commit message
sits in git history for every teammate to read.

**It knows when to drop the bit.** Prod down? User stuck? Destructive action?
Credentials involved? It switches to plain, calm, direct — and resumes the
voice after.

## Before / after

"Should I increase top_k from 5 to 50 because more context is better?"

**Normal:**

> Increasing `top_k` may improve recall, but it can also introduce irrelevant
> documents. Consider evaluating retrieval precision and adding a reranker.

**yo:**

> I'd hold off on 50. More chunks usually means more noise, not more signal,
> and precision drops as the weak matches pile in. Benchmark 5 vs 20 vs 50 on
> your eval set, and try a reranker before you touch top_k again.

**mafa:**

> 50 chunks isn't 'more context', it's a junk drawer 💀. The extra 45 are
> mostly noise and your precision pays for it. Benchmark 5/20/50 on your eval
> set, add a reranker, and only bump top_k if the numbers say so.

Same four technical points every time. Only the voice changes.

## Install

**Claude Code:**

```
/plugin marketplace add prashanthgit19/homie
```

```
/plugin install homie@homie
```

(two separate prompts)

**OpenCode:**

```bash
opencode plugin add @kpnpm/homie
```

or in a project's `opencode.json`:

```json
{ "plugins": ["@kpnpm/homie"] }
```

**Codex:**

```bash
codex plugin marketplace add prashanthgit19/homie
codex plugin add homie@homie
```

Then open `/hooks` in Codex, trust the two lifecycle hooks, and start a new
thread.

**Pi (pi.dev):**

```bash
pi install npm:@kpnpm/homie
```

Also works for Oh My Pi (`omp`), which runs Pi extensions unchanged.

**Any other agent:** copy [`AGENTS.md`](AGENTS.md) into your project, or ask
your agent to install [`skills/homie/SKILL.md`](skills/homie/SKILL.md) as a
skill. More in [INSTALL.md](INSTALL.md).

## Commands

| Command | What it does |
| --- | --- |
| `/homie` | Turn the voice on at **yo**; already on → report the current level |
| `/homie yo` \| `dawg` \| `mafa` | Set the level |
| `/homie off` | Back to normal |
| `/homie default <level>` | Set what new sessions start at (persists across restarts) |

Plain requests work too: "be blunter" goes up one level, "tone it down" goes
down one. "stop homie" turns it off.

Levels persist for the whole session — turn it on once, it holds through
tool calls, long outputs, and topic changes. New sessions start at your
configured default (**yo** out of the box); in Pi the level is scoped to the
session and follows branch navigation, while OpenCode keeps the last level you
set across sessions. A plain-message nudge ("be blunter") shifts the voice for
that reply but does not move the persisted level — `/homie <level>` is the real
switch.

## Settings

Default level for new sessions, in priority order:

1. `HOMIE_DEFAULT_LEVEL` env var (`off`/`yo`/`dawg`/`mafa`)
2. `~/.config/homie/config.json` → `{ "defaultLevel": "mafa" }`
3. `yo` (built-in default)

The Claude Code plugin ships a statusline badge (`[HOMIE]`, `[HOMIE:DAWG]`,
`[HOMIE:MAFA]`). On first session it offers to set it up; accept, and the
current level is always visible in your status bar.

## How it works

One prompt — [`skills/homie/SKILL.md`](skills/homie/SKILL.md) — is the whole
product. No fine-tuning, no second LLM, no proxy. Lifecycle hooks and a
plugin load that prompt into your agent at the active level and keep it
loaded every turn:

```
/homie mafa → flag file → every turn re-injects the mafa policy
```

- **Claude Code / Codex:** `SessionStart` injects the ruleset; `UserPromptSubmit` tracks `/homie` switches mid-session.
- **OpenCode:** a V2 plugin registers the `/homie` command and pushes the policy into the system context on every model call.
- **Pi (pi.dev):** an extension injects the ruleset into the system prompt before every model call and registers `/homie`. The level lives in session entries, so it is scoped to the session and follows branch navigation.
- **Others:** the `AGENTS.md` rules file.

Subagents don't get the voice — subagent prose isn't user-facing.

## FAQ

**Does it change what the agent recommends?** No. The contract is explicit in
the prompt: identical technical answer at every level; the voice never
touches code, commands, or safety judgment.

**Will it swear at me constantly?** No. At mafa, zero or one swear per
response is normal; zero is always fine. Forced profanity is called out in
the prompt as the main failure mode.

## License

[MIT](LICENSE)
