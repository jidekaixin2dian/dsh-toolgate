# Changelog

## 0.2.3 — 2026-11-19

**为什么值得更新**：0.2.0 起「隐藏分组」一直只改设置、不改请求。DSH 0.2.2 把工具行组合在 **agent preset 作用域**，而闸门是从宿主根的全局视图里算 deny 名单的——根视图里只有工具闸门自己那几个全局工具，于是 deny 恒为空，`tools.restrict()` 一次都没被调用：`applied` 空、每个组的 `hideableTokens` 为 0，只有 `core` 有数字。

- deny 名单改用 **agent 视图**（`tools.schemas(agent)`，含 preset 作用域继承来的工具），这是模型真正收到的那一份；`applied` 与 `hideableTokens` 随之变成真实值。
- `hideableTokens` / `scoped` 只统计宿主 `restrict()` 能接受的名字：被宿主拒绝的会话自身作用域工具（动态注册的 MCP 等）单独上报，不再混进可省 token。
- `restrict()` 遇到会话作用域名字时逐个剔除并重试，而不是整条闸门失败；这些工具的实际调用仍由 dispatch guard 拦截。
- 回归：单测桩改成「全局层 ⊂ agent 层」的真实分层，新用例在旧代码上失败、修复后通过。

隔离装置实测（挂真实 `@deepseek-ai/dsh-tools` 0.2.2-rc.3 注册表，host root → preset → agent 作用域链，闸门设 `disabled: ["ego","watch","remote","schedule"]`）：agent 可见工具 **22 → 13**，**2657 → 1461 tokens**（省 1196），`applied` 由 `[]` 变为 `["sess-1"]`。

**Why update**: since 0.2.0, hiding a group changed settings but not the request. DSH 0.2.2 composes tool rows in the **agent preset scope**, while the gate built its deny list from the host root's global view — which holds only the gate's own global tools. The deny list stayed empty, `tools.restrict()` was never called, `applied` was `[]` and every group reported `hideableTokens: 0` except `core`.

- Build the deny list from the **agent view** (`tools.schemas(agent)`), the definitions the model actually receives.
- Count only names the host accepts as hideable; tools registered in the Agent's own scope are reported separately as `scoped`.
- Drop names the host refuses and retry, instead of failing the whole restriction; the dispatch guard still blocks those calls.
- Regression: the unit stub now models the real global-vs-agent layering; the new case fails on the old code and passes with the fix.

Measured in an isolation harness that mounts the real `@deepseek-ai/dsh-tools` 0.2.2-rc.3 registry over a host root → preset → agent scope chain, with the gate set to `disabled: ["ego","watch","remote","schedule"]`: agent-visible tools **22 → 13**, **2657 → 1461 tokens** (1196 saved), and `applied` went from `[]` to `["sess-1"]`.

## 0.2.2 — 2026-11-17

### 中文

- 设置保存成功后再更新生效状态；写入失败时保留完整旧设置。
- 设置页与模型工具共用分组、逐工具开关、预设和规则的修改流程，保留现有配置字段与核心工具保护。
- 分离设置存储、运行态和分组报表，补充失败路径回归与工程文档；意外入口加载错误直接使测试失败。

### English

- Apply settings only after persistence succeeds; failed writes retain the complete previous settings.
- Use the same commands for settings-page and model-tool changes to groups, per-tool switches, presets and rules, preserving configuration fields and core-tool protection.
- Separate settings storage, runtime state and group reporting, with failure-path regressions and architecture documentation. Unexpected entry-loading errors now fail tests.

## 0.2.1 — 2026-11-14

**为什么值得更新**：DSH 0.2.2 起多了一个 `apply_patch`（一次新增、修改、删除、移动多个文件），它和 `write`/`edit` 是同一类写盘工具，却没被保护名单覆盖。在逐工具开关里点掉它，模型就只剩单文件写入路径，README 里「任何配置都关不掉」这句承诺也就不成立了。

- 保护名单加入 `apply_patch`：与 `write`/`edit` 同级，`disabledTools`、规则、预设、会话覆盖都关不掉它。
- 回归宿主张新增 `0.2.2-rc.3` 并设为默认（`scripts/host.mjs`）；Windows 本地跑通 11 项，浏览器用例按设计跳过（CI 里 `TOOLGATE_BROWSER=1` 会跑）。

**Why update**: DSH 0.2.2 added `apply_patch` (create, edit, delete and move several files in one call). It is a write-path tool like `write`/`edit` but sat outside the protected list, so one per-tool switch could hide it and quietly break the "no configuration can hide these" promise.

- Add `apply_patch` to `PROTECTED_TOOLS`; neither `disabledTools`, rules, presets, nor session overrides can hide it.
- Pin `0.2.2-rc.3` as the default regression host; 11 Windows host tests pass and the browser-only case skips by design.

## 0.2.0 — 2026-11-13

**为什么值得更新**：0.1.x 只能关 MCP / Skill / 记忆 / 定时这四类，ego、remote、watch、
团队这些真正占地方的工具一个都关不掉，只能每轮带着进 prompt。0.2.0 把它们变成可关的组，
`lite` 档在本机实测每轮省下约 1 万个 token 的工具 schema；同时修掉「按工具名隐藏其实
没生效」——那个问题会让新按钮看起来按了没用。

- 分组从写死改成**数据**：`DEFAULT_RULES` 自带 ego / memory / remote / watch /
  schedule / team，`toolgate.json` 的 `rules` 可按 id 覆盖或新增；`core` 仍然不可隐藏。
- 新增 `deriveSuggestions()`：没归组的工具若共享同一前缀（≥3 个，如 `job_*`）会作为
  「建议分组」出现在设置页的 status 里，点一下即可变成规则——插件不再需要为每个新包改代码。
- 新增三档预设 `lite` / `standard` / `full`（`op: preset`），预设永不隐藏 `skills`。
- 新增**逐工具**开关：`disabledTools` + `op: tools-set`，`groupReport().groups[].tools`
  返回每个工具名与 token 估算，供 UI 渲染独立按钮。
- 新增**dispatch guard**：`restrict()` 只从列表里摘掉 schema，模型凭历史记忆仍可点名调用；
  现在 `tools.guard()` 会二次拦截并给出可读理由（按会话/全局分别提示）。
- 保护名单 `PROTECTED_TOOLS`（read/write/edit/glob/grep/pwsh/present/todo_write/
  toolgate/ask_user_question）不会被任何配置隐藏，避免把自己锁死。
- 会话级覆盖（`action=session`）沿用原有语义，参数改为按规则校验。

**Why update**: 0.1.x could only switch MCP / Skill / memory / schedule, so ego,
remote, watch and team tools — the ones that actually cost context — entered every
prompt. They are switchable groups now; the `lite` preset measured roughly 10k
fewer tool-schema tokens per turn here. It also fixes "hide by tool name does
nothing", which made the new switches look broken.

- Groups are data now: shipped `DEFAULT_RULES` plus per-id overrides in
  `toolgate.json`; ungrouped tools stay in the un-hideable `core`.
- `deriveSuggestions()` proposes a group for any ≥3 tools sharing a prefix, so a
  new plugin shows up as a suggestion instead of requiring a code change.
- Presets `lite` / `standard` / `full`; presets never hide `skills`.
- Per-tool switches via `disabledTools` / `op: tools-set`, with per-tool rows and
  token estimates in the status payload.
- A dispatch guard (`tools.guard()`) refuses hidden tools that a model names from
  history, with a scope-aware reason string.
- `PROTECTED_TOOLS` keeps the escape hatches (read/write/pwsh/toolgate/…) visible
  under every configuration.

## 0.1.8 — 2026-11-06

- 默认固定宿主升级到 DSH rc.5，兼容验证扩展到 **0.2.2-rc.1**（2026-11-04 发布；
  其开发者侧变更——统一右键菜单、设置页图标槽、PTC/工具链重构——均不触及本
  插件的绑定面与行为）；保留 rc.2–rc.4 回归。
- The default pinned host moves to DSH rc.5 and verified coverage extends to
  **0.2.2-rc.1** (released 2026-11-04; its developer-facing changes — unified
  context menu, settings icon slot, PTC/tooling restructuring — do not touch
  this plugin's bound surface or behavior). rc.2–rc.4 regressions are retained.
- `scripts/host.mjs` 按条目携带完整 tag（0.2.2 行不再复用 `dsh-v0.2.1-` 前缀拼接），
  宿主目录缺失时给出 setup 提示而非 TypeError。
- `scripts/host.mjs` now carries a full tag per entry (the 0.2.2 line no longer
  fits the `dsh-v0.2.1-<version>` prefix scheme) and reports the setup step when
  the host checkout is missing instead of crashing.

## 0.1.7 — 2026-11-02

- 修复设置页空白：0.1.6 新增的「项目与反馈」直接读取 `ctx.locale`，而插件未声明 `locale` 服务；较新的宿主对该读取直接抛错（`cannot get property "locale" without inject`），整个 `settings.section` 条目被错误边界吞掉，点进「工具闸门」只剩空白。
- 在 `inject` 中声明 `locale`，并将该读取包在 `try/catch` 里回退到 `navigator.language`，与其他可选服务读取保持一致。
- Fix blank settings page: the 0.1.6 project/feedback block read `ctx.locale` without declaring the service. Newer hosts throw on that read, the whole `settings.section` entry is swallowed by the error boundary, and the Toolgate page renders empty. `locale` is now declared and the read falls back to `navigator.language`.
- 新增 3 项客户端渲染回归测试，覆盖「宿主拒绝 locale 服务」时设置页仍渲染，以及中英文文案跟随语言。

## 0.1.6 — 2026-10-31

- 设置页新增「项目与反馈」入口，在预算、MCP、Skills 页面均可打开对应 GitHub 项目或新建反馈；页面加载失败时也保留入口。
- Add project and issue links across settings tabs, including when the main settings panel fails to load.

## 0.1.5 — 2026-10-28

- 发布与更新维护：明确 npm 安装、GitHub 来源迁移、市场检测与重启步骤；保留既有运行时行为。
- 固定并验证 DSH 0.2.1-rc.4，同时保留较旧宿主回归。
- 新增 npm 公开发布配置、tag/main/CI/归档门槛与 Trusted Publishing 工作流；继续复用宿主运行时，不安装第二份 DSH。


## 0.1.4 — 2026-10-26

- 重整中英文 README：安装更新优先，保留兼容与权限边界，开发说明移入独立文档。
- Refresh Chinese/English documentation and installation guidance; runtime behavior is unchanged.
- 使用 GitHub 源安装以支持市场版本检查；包含尚未发包的 rc.2 / rc.3 宿主支持声明。


## Previously unreleased compatibility metadata

- Declare the supported host explicitly: `engines.dsh >=0.2.1-rc.2`, with CI
  continuously verifying both 0.2.1-rc.2 and 0.2.1-rc.3.
- Re-pin the host regression suite to DSH 0.2.1-rc.3 (`1f81c047`): rc.2 → rc.3
  changed no source in the packages this plugin uses, and the authenticated host
  suite passes unchanged (11 passed / 1 browser-gated skip). Shipped plugin
  code and the peer range (`>=0.2.1-rc.1 <0.3.0-0`) are unchanged.

## 0.1.3 — 2026-10-24

- Add an append-only audit log at `DSH_HOME/toolgate-audit.jsonl`: one JSON line
  per management write (op, target id, outcome, timestamp), never containing
  env/header values. It rotates past 1 MiB to `.1` and a failed append never
  blocks the operation it records.
- Tighten the management API: `mcp-add` and `mcp-edit` now accept only the
  documented `{ row }` payload; flattened probe bodies are rejected with the
  normal validation error instead of being silently interpreted.
- Add the `allowSessionOverride` plugin config (default `true`). Set it to `false`
  to make the `toolgate` model tool read-only: `action=session` and `action=reset`
  return a notice without changing tool visibility, so prompt-injected turns
  cannot hide tool groups; the authenticated settings page still owns the gate.
- Cap configuration backups at the 20 most recent copies under
  `DSH_HOME/backups/toolgate/`; pruning runs after a successful write only, so
  failed writes keep their recovery copy. Backup directories are matched by the
  exact `timestamp-uuid` naming pattern and foreign entries are never removed.

## 0.1.2 — 2026-10-23

- Align the release tag and archive, including the scoped client bundle. The
  0.1.1 archive had the fix, but its tag source did not; neither is overwritten.
- Verify published package versions and all archive files against tagged source,
  allowing only Git checkout line endings, and check the GitHub asset digest.
- Correct stale installation/version documentation and remove the stale UI
  version label.

## 0.1.1 — 2026-10-23

- Authenticate management requests using the running host Connection service;
  reject missing auth support and omit secret values from management responses.
- Edit YAML nodes precisely, retain sibling configuration and complex arguments,
  compose profile/global/overlay layers using the host, and back up atomic writes.
- Resolve the current DSH home/profile and selected workspace from host services.
  Keep Skill provider/path identities, scoped restrictions and recoverable trash.
- Own state per plugin instance, release restrictions on unload and clear disposed
  Agent overrides. Roll back Skill toggles if settings cannot be persisted; use
  unique private temporary files and clean failed writes.
- Add Windows/Linux unit, authenticated host/browser and archive-install CI.

See [root-cause evidence](docs/root-cause-fixes.md). Release 0.1.0 lacks these fixes. Its historical assets remain unchanged.

## 0.1.0

Initial Toolgate release after the Context Budget rename. Historical archive;
does not include the authentication, configuration integrity or lifecycle fixes.
