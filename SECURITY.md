# Security Policy

## Supported versions

Only the latest published version receives fixes.

## Reporting a vulnerability

Please report suspected vulnerabilities privately using GitHub's
[private vulnerability reporting](https://github.com/prashanthgit19/homie/security/advisories/new)
rather than opening a public issue.

Include what you did, what happened, and what you expected. You can expect an
initial response within a few days.

## Scope

homie is a prompt-injection personality layer. It ships no network code and no
runtime dependencies. Its hook scripts run with the same permissions as the
agent that loads them, so the relevant questions are:

- Can a hook script execute commands outside the intended behaviour?
- Can project files influence the injected instructions beyond the documented
  level semantics?
- Can the plugin read or exfiltrate data (it should not)?

Reports that amount to "a prompt file changes the model's tone" are working as
intended.
