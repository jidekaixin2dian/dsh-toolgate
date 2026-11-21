# 工具闸门 · Toolgate

**让下一轮 prompt 只带需要的工具。**

[English](README.en.md) · [npm · 0.2.4](https://www.npmjs.com/package/@jidekaixin2dian/dsh-toolgate/v/0.2.4) · [插件市场](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-toolgate/) · [下载](https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest) · [更新记录](CHANGELOG.md)

Toolgate 为 DeepSeek Harness（DSH）提供统一的 MCP、Skill 和上下文预算设置页。按服务器隐藏当前用不到的工具定义，让下一轮 prompt 聚焦当前任务；需要时恢复，MCP 配置和连接保持。

![工具分组示意，示例数量不代表实测节省](assets/readme-schema-v2.svg)

## 隐藏工具定义，MCP 保持连接

| 页面 | 你可以做什么 |
|---|---|
| 预算 | 查看估算占用，隐藏单组、全部 MCP 或最大组，恢复工具 |
| MCP 服务器 | 新增、编辑、启停、删除服务器；支持 stdio 与 streamable-http |
| Skills | 按会话工作区搜索、新建、启停；可删除的本地 Skill 移到回收目录 |

按组隐藏当前任务用不到的工具，需要时一键恢复。配置和运行中的 MCP 保留，下一轮 prompt 使用调整后的工具列表。页面按工具 schema 和描述长度估算 token，占用与实际费用或速度不是同一指标。设置页预算作用于所有会话和子代理，允许的会话覆盖只影响当前会话。

## 0.2.3：隐藏分组真的从下一轮请求里消失

DSH 0.2.2 把工具行组合在 **agent preset 作用域**。0.2.2 及更早的闸门却从宿主根的全局视图（无 scope 的 `tools.schemas()`）算 deny 名单——根视图里只有闸门自己那几个全局工具，名单恒为空，`tools.restrict()` 一次都没被调用：隐藏分组只改设置，不改请求。0.2.3 改成按 agent 视图取名单。隔离装置挂真实宿主注册表实测：agent 可见工具 **22 → 13**，**2657 → 1461 tokens**（省 1196）。

| 修复 | 说明 |
|---|---|
| deny 名单来源 | 用 `tools.schemas(agent)`（含 preset 作用域继承来的工具），即模型真正收到的定义；`applied` 与各组 `hideableTokens` 变成真实值 |
| 会话自身作用域工具 | 宿主 `restrict()` 会因作用域外名字整条抛错，现在逐个剔除后重试，单独计入 `status.scoped`，不再混进可省 token；这些工具的实际调用仍由分发守卫拦截 |
| 回归 | 单测桩改成「全局层 ⊂ agent 层」的真实分层，新用例在旧代码上失败、修复后通过 |

## 0.2.0：分组是数据，不是写死的表

| 能力 | 说明 |
|---|---|
| 自动分组 | 工具按注册名自动归组（`ego_`、`mnemon_`、`remote_`、`watch_`、`schedule_`、`team_task_`、`mcp__<服务器>__*`）；没归组的留在「核心工具」，不可隐藏 |
| 建议分组 | 「核心工具」里有 ≥3 个工具共享同一前缀（例如 `job_list` / `job_output` / `job_kill`）时，作为建议出现在状态里，一键变成规则 |
| 自定义规则 | `toolgate.json` 的 `rules: [{ id, prefixes, exact?, label? }]` 可新增分组，或按 id 覆盖内置分组的前缀 |
| 三档预设 | `lite` / `standard` / `full` 一键切换；预设永不隐藏 Skill 目录 |
| 逐工具开关 | `disabledTools` 精确隐藏单个工具，`status.groups[].tools` 返回每个工具名与 token 估算 |
| 分发守卫 | `restrict()` 只把 schema 从列表里摘掉，模型凭历史记忆仍可点名调用；新增的 `tools.guard()` 会在分发前二次拒绝，并说明是本会话还是全局闸门 |
| 保护名单 | `read/write/edit/apply_patch/glob/grep/pwsh/present/todo_write/toolgate/ask_user_question` 任何配置都关不掉（`apply_patch` 是 DSH 0.2.2 起的多文件写入工具，与 write/edit 同级） |

也可以用工具本身操作：`toolgate action=status` 看分组，`action=preset preset=lite` 切档，`action=tools tools=[...]` 精确隐藏，`action=session disabled=[...]` 只改本会话，`action=reset` 取消会话覆盖。

## 安装与更新

需要 **DSH >=0.2.1-rc.2、Node >=24**；持续验证 DSH rc.2 / rc.3 / rc.4 / 0.2.2-rc.1 / 0.2.2-rc.5。

在插件市场搜索 **dsh-toolgate**，确认作者为 **jidekaixin2dian**。npm 与 GitHub 来源都支持版本检查；市场识别 npm 包后优先使用 npm，可在「已安装」中检查更新。目录与 registry 数据可能有同步延迟。

Desktop 用户在应用内插件市场安装、更新或卸载，按提示重启。Web/CLI 用户停止对应会话后，可对 `web` profile 执行以下命令；重复执行即可更新：

```powershell
dsh plugin --profile web add @jidekaixin2dian/dsh-toolgate --registry=https://registry.npmjs.org
```

离线安装包见 [Release](https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest)。桌面端运行期间请使用其插件管理器，遵守 profile 锁。

## 三步开始

1. 打开 **设置 → 工具闸门**，在「预算」查看各组工具。
2. 隐藏当前任务不需要的组；从下一轮 prompt 生效，可随时恢复。
3. 管理 MCP 或 Skill 时，先核对配置范围或选中的工作区会话，再保存。

MCP 编辑保留无关配置和注释，写前备份；歧义配置或只读来源会拒绝修改。密钥字段默认保留，不回传明文。操作审计记录不包含密钥值。

Skill 保留来源身份，仅匹配当前根目录的本地 `.dsh/skills/<name>` 可删除，删除移入 `.trash`。共享、bundled、custom 与虚拟来源保持只读。

<details>
<summary>会话工具与固定全局设置</summary>

模型可使用以下工具查看状态或设置当前会话的覆盖：

```text
toolgate action=status
toolgate action=session disabled=["mcp:github", "skills"]
toolgate action=reset
```

`mcp` 匹配全部 MCP；`mcp:<server>` 只匹配一台服务器。设置页预算作用于所有会话和子代理，会话覆盖只影响当前会话。

设置 `allowSessionOverride: false` 后，模型不能更改或重置会话覆盖；全局设置仍由设置页控制。

</details>

旧 `.tgz` 或本地安装用户可在同一 profile 执行上面的命令切换到 npm；已有 GitHub 源仍可更新。

## 使用边界

设置页底部的「项目与反馈」可打开本插件的 GitHub 项目或新建反馈，在三个标签页中都能找到。

- 工具隐藏用于上下文预算，**不是权限沙箱**。MCP 进程不会因此停止；默认允许的会话覆盖可以恢复工具。
- token 数与示意图都不代表实际费用或速度收益；token 仅按 schema / 描述长度估算。
- agent 作用域中的部分动态工具无法隐藏，请用对应管理器卸载。Skill ZIP / 文件夹导入尚未实现。
- MCP 管理会写配置；手工编辑过配置时先核对差异。备份位于 `DSH_HOME/backups/toolgate/`，成功写入后保留最近 20 份，**备份可能包含原始密钥，请勿公开**。
- 审计记录位于 `DSH_HOME/toolgate-audit.jsonl`。管理接口依赖宿主认证和当前 profile，缺失时拒绝访问。
- 插件本身更新需要重开 DSH；已有 MCP 配置变更可由宿主热重载。

Web/CLI 卸载：停止对应会话后执行 `dsh plugin --profile web remove @jidekaixin2dian/dsh-toolgate`，再重新启动会话。

## 下载情况

| GitHub 安装包 | npm | 合计 |
|---:|---:|---:|
| [467](https://api.github.com/repos/jidekaixin2dian/dsh-toolgate/releases?per_page=100) | [679](https://api.npmjs.org/downloads/point/2026-10-28:2026-11-04/@jidekaixin2dian%2Fdsh-toolgate) | **1,146 次** |

统计于 2026-11-06；npm 数据截至 2026-11-04。GitHub 仅计安装包，npm 排除 `0.0.0-stage`。下载包含重复安装与自动化请求，不是独立用户数。

[开发与验证](https://github.com/jidekaixin2dian/dsh-toolgate/blob/main/docs/development.md) · [安全说明](SECURITY.md) · [反馈问题](https://github.com/jidekaixin2dian/dsh-toolgate/issues)

MIT · 独立社区插件，与 DeepSeek 官方无隶属关系。
