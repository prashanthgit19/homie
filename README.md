# chill

*Same brain. Same code. Different voice.*

Your coding agent didn't need another corporate assistant. **chill** switches
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
/plugin marketplace add prashanthgit19/chill
```

```
/plugin install chill@chill
```

(two separate prompts)

**OpenCode:**

```bash
opencode plugin add @prashanthgit19/chill
```

or in a project's `opencode.json`:

```json
{ "plugins": ["@prashanthgit19/chill"] }
```

**Codex:**

```bash
codex plugin marketplace add prashanthgit19/chill
codex plugin add chill@chill
```

Then open `/hooks` in Codex, trust the two lifecycle hooks, and start a new
thread.

**Any other agent:** copy [`AGENTS.md`](AGENTS.md) into your project, or ask
your agent to install [`skills/chill/SKILL.md`](skills/chill/SKILL.md) as a
skill. More in [INSTALL.md](INSTALL.md).

## Commands

| Command | What it does |
| --- | --- |
| `/chill` | Turn the voice on at **yo**; already on → report the current level |
| `/chill yo` \| `dawg` \| `mafa` | Set the level |
| `/chill off` | Back to normal |
| `/chill default <level>` | Set what new sessions start at (persists across restarts) |

Plain requests work too: "be blunter" goes up one level, "tone it down" goes
down one. "stop chill" turns it off.

Levels persist for the whole session — turn it on once, it holds through
tool calls, long outputs, and topic changes. New sessions start at your
configured default (**yo** out of the box).

## Settings

Default level for new sessions, in priority order:

1. `CHILL_DEFAULT_LEVEL` env var (`off`/`yo`/`dawg`/`mafa`)
2. `~/.config/chill/config.json` → `{ "defaultLevel": "mafa" }`
3. `yo` (built-in default)

The Claude Code plugin ships a statusline badge (`[CHILL]`, `[CHILL:DAWG]`,
`[CHILL:MAFA]`). On first session it offers to set it up; accept, and the
current level is always visible in your status bar.

## How it works

One prompt — [`skills/chill/SKILL.md`](skills/chill/SKILL.md) — is the whole
product. No fine-tuning, no second LLM, no proxy. Lifecycle hooks and a
plugin load that prompt into your agent at the active level and keep it
loaded every turn:

```
/chill mafa → flag file → every turn re-injects the mafa policy
```

- **Claude Code / Codex:** `SessionStart` injects the ruleset; `UserPromptSubmit` tracks `/chill` switches mid-session.
- **OpenCode:** a V2 plugin registers the `/chill` command and pushes the policy into the system context on every model call.
- **Others:** the `AGENTS.md` rules file.

Subagents don't get the voice — subagent prose isn't user-facing.

## FAQ

**Does it change what the agent recommends?** No. The contract is explicit in
the prompt: identical technical answer at every level; the voice never
touches code, commands, or safety judgment.

**Will it swear at me constantly?** No. At mafa, zero or one swear per
response is normal; zero is always fine. Forced profanity is called out in
the prompt as the main failure mode.

**Does it work with [ponytail](https://github.com/DietrichGebert/ponytail)?**
Yes, and they compose well: ponytail governs what gets built, chill governs
how it's talked about. Different halves, no overlap.

## License

[MIT](LICENSE)