# Toolgate 代码地图

`lib/index.js` 连接宿主生命周期、模型工具和认证 HTTP 路由。设置页使用同源 HTTP，模型使用 toolgate 工具，两种入口调用同一组设置命令。

| 文件 | 职责 |
|---|---|
| `gate-commands.js` | 设置隐藏组、具体工具、具名预设和用户规则；统一保存成功后的审计与限制失效 |
| `settings-store.js` | 读取/迁移/原子保存 toolgate.json；磁盘字段保持原格式，内存区分 disabledGroups、disabledToolNames、userRules |
| `groups.js` | 分组、保护工具与隐藏判定；core 是未匹配规则的分组，保护名单独立判断 |
| `group-report.js` | 从传入的 schema、Skill 目录和设置快照生成报表，不读取文件或宿主服务 |
| `index.js` | 会话覆盖、Agent 限制 disposer、计时器、schema 参考快照、restrict 与 dispatch guard |
| `mcp-config.js` / `config-files.js` | 宿主补丁合成、YAML 精确编辑和多文件保存 |
| `skills-runtime.js` / `skills-config.js` | 按来源身份覆盖 Skill；本地目录创建与回收 |
| `host-paths.js` | 从宿主取得 profile、home 和选中工作区，统一可选服务读取 |
| `client.js` | 设置页展示和请求；不直接写文件 |

设置命令先保存候选值，成功后更新共享设置对象。Skill provider 持有同一设置对象，其来源身份和失败恢复仍由 skills-runtime 管理。运行资源不写进 toolgate.json。

具名 preset 是 lite/standard/full；前端 applyGroupSelection 表示一次组选项修改。会话覆盖独立于全局设置。restrict 控制模型看见的 schema，guard 检查实际调用，二者使用相同隐藏判定。

`npm test` 包含可独立运行的规则/持久化测试；缺少明确的宿主 peer 时入口集成用例会显示 skip，其他导入错误直接失败。真实宿主与浏览器运行方法见 [开发与验证](development.md)。
