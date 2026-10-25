# Toolgate

**Bring only the tools you need into the next prompt.**

[中文](README.md) · [Marketplace](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-toolgate/) · [Download](https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest) · [Changelog](CHANGELOG.md)

Manage MCP servers, skills and tool visibility in one DSH settings page. Hide schemas by server and restore them when needed; MCP processes keep running.

![Tool grouping illustration; example counts are not measured savings](assets/readme-schema-v2.svg)

| Tab | What it does |
|---|---|
| Budget | Estimate context usage, hide groups / all MCP / the largest group, restore tools |
| MCP servers | Add, edit, enable, disable and remove stdio or streamable-http servers |
| Skills | Search, create and toggle by Session workspace; move eligible local skills to trash |

## Install and update

Requires **DSH >=0.2.1-rc.2 and Node >=24**. CI verifies DSH rc.2 / rc.3.

Search for **dsh-toolgate**, author **jidekaixin2dian**, in the marketplace. The GitHub installation source follows maintained release versions and supports checking updates under installed plugins. Catalog caches may take time to refresh.

Alternatively, quit DSH and run the same command to install or update, then reopen it:

```powershell
dsh plugin --profile desktop add github:jidekaixin2dian/dsh-toolgate
```

Offline packages are available in [Releases](https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest). While Desktop owns a running profile, use its plugin manager and respect profile locks.

## Get started

1. Open **Settings → Toolgate** and review groups under Budget.
2. Hide groups this task does not need. Changes apply from the next prompt and can be reversed.
3. Before changing MCP or skills, verify the configuration scope or selected workspace Session.

MCP edits preserve unrelated configuration and comments, back up before writing and reject ambiguous or read-only sources. Secret fields are retained by default and never returned in plaintext. Audit entries exclude secret values.

Skills retain source identity. Only matching local `.dsh/skills/<name>` directories can move to `.trash`; shared, bundled, custom and virtual sources stay read-only.

<details>
<summary>Session tool and fixed global settings</summary>

```text
toolgate action=status
toolgate action=session disabled=["mcp:github", "skills"]
toolgate action=reset
```

`mcp` matches all MCP; `mcp:<server>` matches one. Settings apply globally to sessions and subagents, while Session overrides affect only that Session.

Set `allowSessionOverride: false` to prevent the model from changing or resetting Session overrides. The settings page still controls the global gate.

</details>

## Boundaries

- Hiding tools is context budgeting, **not a permission sandbox**. MCP processes keep running; permitted Session overrides can restore tools.
- Token estimates use schema / description length. Neither estimates nor illustrated counts establish cost or latency savings.
- Some dynamically scoped tools cannot be hidden; use their manager to unload them. Skill ZIP / folder import is not implemented.
- MCP management writes configuration. Review changes to hand-edited files. Backups under `DSH_HOME/backups/toolgate/` retain the latest 20 after successful writes and **may contain original secrets; keep them private**.
- Audit records are stored in `DSH_HOME/toolgate-audit.jsonl`. Management requires host authentication and the current profile, failing closed if either is missing.
- Plugin updates require an app restart; existing MCP configuration changes can hot reload through the host.

To remove, quit DSH, run `dsh plugin --profile desktop remove @jidekaixin2dian/dsh-toolgate`, then reopen it.

[Development and verification](https://github.com/jidekaixin2dian/dsh-toolgate/blob/main/docs/development.md) · [Security](SECURITY.md) · [Issues](https://github.com/jidekaixin2dian/dsh-toolgate/issues)

MIT · Independent community plugin, not affiliated with DeepSeek.
