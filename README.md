# Toolgate · 工具闸门

**让下一轮 prompt 只带需要的工具。**

[English](README.en.md) · [插件市场](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-toolgate/) · [下载](https://github.com/jidekaixin2dian/dsh-toolgate/releases/latest) · [更新记录](CHANGELOG.md)

在 DSH 的一个设置页里管理 MCP 服务器、Skill 和工具可见性。按服务器隐藏整组工具 schema，需要时再恢复，MCP 进程继续运行。

![工具分组示意，示例数量不代表实测节省](assets/readme-schema-v2.svg)

| 页面 | 你可以做什么 |
|---|---|
| 预算 | 查看估算占用，隐藏单组、全部 MCP 或最大组，恢复工具 |
| MCP 服务器 | 新增、编辑、启停、删除服务器；支持 stdio 与 streamable-http |
| Skills | 按会话工作区搜索、新建、启停；可删除的本地 Skill 移到回收目录 |

## 安装与更新

需要 **DSH >=0.2.1-rc.2、Node >=24**；持续验证 DSH rc.2 / rc.3。

在插件市场搜索 **dsh-toolgate**，确认作者为 **jidekaixin2dian**。市场 GitHub 安装源随已发布版本维护，可在「已安装」中检查更新；目录缓存可能稍后刷新。

也可完全退出 DSH 后执行以下命令；再次执行即可更新，随后重新打开 DSH：

```powershell
dsh plugin --profile desktop add github:jidekaixin2dian/dsh-toolgate
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

## 使用边界

- 工具隐藏用于上下文预算，**不是权限沙箱**。MCP 进程不会因此停止；默认允许的会话覆盖可以恢复工具。
- token 数与示意图都不代表实际费用或速度收益；token 仅按 schema / 描述长度估算。
- agent 作用域中的部分动态工具无法隐藏，请用对应管理器卸载。Skill ZIP / 文件夹导入尚未实现。
- MCP 管理会写配置；手工编辑过配置时先核对差异。备份位于 `DSH_HOME/backups/toolgate/`，成功写入后保留最近 20 份，**备份可能包含原始密钥，请勿公开**。
- 审计记录位于 `DSH_HOME/toolgate-audit.jsonl`。管理接口依赖宿主认证和当前 profile，缺失时拒绝访问。
- 插件本身更新需要重开 DSH；已有 MCP 配置变更可由宿主热重载。

卸载：退出 DSH 后执行 `dsh plugin --profile desktop remove @jidekaixin2dian/dsh-toolgate`，再重新打开。

[开发与验证](https://github.com/jidekaixin2dian/dsh-toolgate/blob/main/docs/development.md) · [安全说明](SECURITY.md) · [反馈问题](https://github.com/jidekaixin2dian/dsh-toolgate/issues)

MIT · 独立社区插件，与 DeepSeek 官方无隶属关系。
