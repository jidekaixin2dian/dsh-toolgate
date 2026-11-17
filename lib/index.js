import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-toolgate'
export const inject = ['tools', 'skills', 'webServer']
export const Config = z.object({ allowSessionOverride: z.boolean().default(true) })

import {
  isDisabled, isProtectedTool, normalizeDisabled, normalizeRules, shouldApplyGate, toolHidden,
  PRESET_IDS,
} from './groups.js'
import { requestArgs } from './api-payload.js'
import { appendAudit } from './audit.js'
import { createMcpConfig, publicServers } from './mcp-config.js'
import { hostPaths, serviceOn } from './host-paths.js'
import { createSettingsStore } from './settings-store.js'
import { createGateCommands } from './gate-commands.js'
import { buildGroupReport, tokensOf } from './group-report.js'
import { installSkills } from './skills-runtime.js'

export async function apply(ctx, config = {}) {
  // Prompt-injected traffic reaches the model tool; `false` lets a profile pin
  // the global gate so only the authenticated settings page can change it.
  const allowSessionOverride = config.allowSessionOverride !== false
  const locations = hostPaths(ctx)
  let mcp, mcpError
  try {
    const profile = serviceOn(ctx, 'profileContext')
    const options = { ...locations }
    if (profile) {
      const [{ readBundlePatches }, { applyEntryPatches }] = await Promise.all([
        import('@deepseek-ai/dsh-app-boot'), import('@deepseek-ai/cordis-plugin-include'),
      ])
      options.basePatches = () => readBundlePatches('dsh', profile)
      options.overlays = profile.overlays
      options.compose = applyEntryPatches
    }
    mcp = createMcpConfig(options)
  } catch (error) { mcpError = '无法读取宿主 profile：' + error.message }
  const store = createSettingsStore(locations.home)
  const settings = store.settings
  const runtime = {
    disposed: false,
    timers: new Set(),
    overrides: new Map(),
    applied: new Map(),
    errors: new Map(),
    applying: false,
    stale: false,
    // Counts/tokens for the full agent-visible tool set. The root tools view
    // only contains global registrations; preset-scoped core tools are only
    // visible through an agent, so the first real request records the full set.
    referenceSchemas: null,
  }
  const rootCtx = ctx

  function fmt(n) {
    const v = Number(n) || 0
    if (v >= 10000) return (v / 10000).toFixed(1) + '万'
    return String(Math.round(v))
  }

  async function skillCatalog(ctx, agent) {
    try {
      const skills = ctx.get?.('skills') ?? ctx.skills
      if (!skills || typeof skills.list !== 'function') return []
      const list = await Promise.resolve(skills.list({ ...(agent ? { cwd: serviceOn(ctx, 'workingDirectory')?.get?.(agent.session), scope: agent } : locations.workspace ? { cwd: locations.workspace } : {}) }))
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  async function groupReport(ctx, agent) {
    return buildGroupReport({
      schemas: runtime.referenceSchemas || ctx.tools.schemas(),
      globalSchemas: ctx.tools.schemas(),
      catalog: await skillCatalog(ctx, agent),
      disabledGroups: agent ? effectiveDisabled(agent) : settings.disabledGroups,
      disabledToolNames: settings.disabledToolNames,
      userRules: settings.userRules,
      preset: settings.preset,
    })
  }

  function sessionIdOf(agent) {
    return String(agent?.session?.id || agent?.sessionId || agent?.id || 'anonymous')
  }

  function effectiveDisabled(agent) {
    const sid = sessionIdOf(agent)
    return runtime.overrides.has(sid) ? runtime.overrides.get(sid) : settings.disabledGroups
  }

  function applyToAgent(agent) {
    const ag = agent?.agent ?? agent
    if (runtime.disposed || !ag || !ag.ctx) return
    const sid = sessionIdOf(ag)
    if (runtime.stale) {
      clearApplied()
      runtime.stale = false
    }
    if (!runtime.referenceSchemas) {
      try {
        const visible = rootCtx.tools.schemas(ag)
        if (Array.isArray(visible) && visible.length > 0) runtime.referenceSchemas = visible
      } catch { /* tool view not ready yet */ }
    } else {
      try {
        const visible = rootCtx.tools.schemas(ag)
        if (Array.isArray(visible) && visible.length > runtime.referenceSchemas.length) runtime.referenceSchemas = visible
      } catch { /* tool view not ready yet */ }
    }
    const disabled = effectiveDisabled(ag)
    const key = disabled.slice().sort().join(',') + '|' + settings.disabledToolNames.slice().sort().join(',') + '|' + normalizeRules(settings.userRules).length
    const previous = runtime.applied.get(ag)
    if (previous && previous.key === key) return
    if (previous) {
      runtime.applying = true
      try { previous.dispose() } catch { /* stale agent scope */ } finally { runtime.applying = false }
      runtime.applied.delete(ag)
    }
    // Both halves of the gate matter: an empty group list with a non-empty
    // exact-tool list must still reach restrict(), otherwise the per-tool
    // buttons update the file and change nothing in the prompt.
    if (!shouldApplyGate(disabled, settings.disabledToolNames)) {
      runtime.errors.delete(sid)
      return
    }
    const agentTools = serviceOn(ag.ctx, 'tools')
    if (!agentTools || typeof agentTools.restrict !== 'function') {
      runtime.errors.set(sid, 'agent ctx has no restrictable tools service')
      return
    }
    const full = rootCtx.tools.schemas()
    const deny = full.map(schema => schema.name).filter(n => toolHidden(n, disabled, settings.disabledToolNames, settings.userRules))
    if (deny.length === 0) return
    runtime.applying = true
    try {
      const dispose = agentTools.restrict({ deny })
      runtime.applied.set(ag, { key, dispose })
      runtime.errors.delete(sid)
    } catch (err) {
      runtime.errors.set(sid, String(err?.message || err))
    } finally {
      runtime.applying = false
    }
  }

  function clearApplied() {
    runtime.applying = true
    try {
      for (const entry of runtime.applied.values()) {
        try { entry.dispose() } catch { /* agent may already be gone */ }
      }
      runtime.applied.clear()
      runtime.errors.clear()
    } finally {
      runtime.applying = false
    }
  }

  async function reportFor(agent) {
    const full = await groupReport(rootCtx, agent)
    let current = full.totals.full
    let currentCount = rootCtx.tools.schemas().length
    if (agent?.ctx) {
      try {
        const visible = rootCtx.tools.schemas(agent)
        currentCount = visible.length
        current = 0
        for (const schema of visible) current += tokensOf(schema)
        // Preserve the full skill-catalog estimate when `skill` is still visible.
        if (visible.some(schema => schema.name === 'skill')) current += full.catalogTokens
      } catch { /* fall back to global estimate */ }
    }
    const overridden = runtime.overrides.has(sessionIdOf(agent))
    const disabled = effectiveDisabled(agent)
    const lines = []
    lines.push('Toolgate' + (overridden ? '（本会话覆盖）' : ''))
    lines.push('完整: ' + fmt(full.totals.full) + ' tokens / ' + fullCount(full) + ' 个工具')
    lines.push('当前: ' + fmt(current) + ' tokens / ' + currentCount + ' 个工具')
    lines.push('节省: ' + fmt(Math.max(0, full.totals.full - current)) + ' tokens')
    lines.push('隐藏: ' + (disabled.length ? disabled.join(', ') : '无'))
    lines.push('')
    for (const g of full.groups) {
      lines.push('- ' + g.id + ' (' + g.label + '): ' + g.count + ' 个，约 ' + fmt(g.tokens) + ' tokens' + (isDisabled(g.id, disabled) ? ' [已隐藏]' : ''))
    }
    lines.push('')
    lines.push(allowSessionOverride
      ? '用 action=session + disabled=[...] 只改本会话；action=reset 恢复默认。'
      : '会话级覆盖已被宿主设置禁用，请在 设置 → 工具闸门 修改全局闸门。')
    return lines.join('\n')
  }

  function fullCount(report) {
    return report.groups.reduce((sum, g) => sum + g.count, 0)
  }

  function readBody(req, limit = 64 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0, exceeded = false
      req.on('data', chunk => {
        if (exceeded) return
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > limit) { exceeded = true; chunks.length = 0; reject(Object.assign(new Error('body too large'), { status: 413 })); return }
        chunks.push(buffer)
      })
      req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks).toString('utf8')) })
      req.on('error', reject)
      req.on('aborted', () => reject(new Error('request aborted')))
    })
  }

  ctx.effect(() => () => {
    runtime.disposed = true
    for (const timer of runtime.timers) clearTimeout(timer)
    runtime.timers.clear()
    clearApplied()
    runtime.overrides.clear()
    runtime.referenceSchemas = null
  })
  const skillManager = installSkills(ctx, settings, locations, store.save)
  const audit = entry => {
    if (!appendAudit(locations.home, entry)) ctx.logger?.warn?.('Toolgate audit log write failed for %s', entry.op)
  }
  const commands = createGateCommands(store, { audit, invalidate: clearApplied })
  const auditTarget = (op, args) => op === 'mcp-add' || op === 'mcp-edit'
    ? String(args.row?.id || args.row?.serverName || '')
    : String(args.id || args.name || '')

  const tool = defineTool({
    name: 'toolgate',
    description: [
      'Inspect or shrink this session context by hiding tool groups or single tools.',
      'Groups are discovered from the tools that actually registered (ego, remote, watch, team, schedule, memory, skills, mcp:<server>, …),',
      'plus any custom rule in toolgate.json; anything ungrouped stays in core and cannot be hidden.',
      'This changes the very next request, is reversible, and does not restart MCP processes.',
      'Use action=status first. action=session/disabled applies a session-only override, action=reset drops it,',
      'action=preset with lite|standard|full switches the global gate, and action=tools with exact names hides individual tools.',
      'Global settings live in Settings > Toolgate.',
      ...(allowSessionOverride ? [] : ['Session overrides are disabled by the host; only action=status is available.']),
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'status | session | reset | preset | tools',
      },
      disabled: {
        type: 'array',
        items: { type: 'string' },
        description: 'Groups to hide: ego, memory, remote, watch, schedule, team, skills, mcp:<server>, mcp (all MCP), or a custom rule id. Empty means show all.',
      },
      preset: {
        type: 'string',
        description: 'With action=preset: lite | standard | full.',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'With action=tools: exact tool names to hide globally. Protected tools (read/write/pwsh/toolgate/…) are ignored.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) return 'No active agent context; toolgate only works inside a session.'
      const action = String(args.action || 'status').trim().toLowerCase()
      const sid = sessionIdOf(agent)
      if (action === 'status') return reportFor(agent)
      if (!allowSessionOverride && (action === 'session' || action === 'reset')) {
        return '会话级覆盖已被宿主设置禁用（allowSessionOverride=false）；全局工具闸门只能在 设置 → 工具闸门 中修改。\n\n' + await reportFor(agent)
      }
      if (action === 'reset') {
        runtime.overrides.delete(sid)
        applyToAgent(agent)
        return '已恢复全局工具闸门。\n\n' + await reportFor(agent)
      }
      if (action === 'session') {
        const disabled = normalizeDisabled(args.disabled, settings.userRules)
        runtime.overrides.set(sid, disabled)
        applyToAgent(agent)
        return '已应用本会话覆盖：' + (disabled.length ? disabled.join(', ') : '全部显示') +
          '\n\n' + await reportFor(agent)
      }
      if (action === 'preset') {
        const name = String(args.preset || '').trim().toLowerCase()
        if (!PRESET_IDS.includes(name)) {
          return '未知预设 "' + name + '"。可选：' + PRESET_IDS.join(' / ') +
            '\n\n' + await reportFor(agent)
        }
        try { commands.selectPreset(name) } catch (error) { return '保存失败：' + (error?.message || error) }
        applyToAgent(agent)
        return '已切换到 ' + name + ' 档（全局）：' + (settings.disabledGroups.length ? settings.disabledGroups.join(', ') : '全部显示') +
          '\n\n' + await reportFor(agent)
      }
      if (action === 'tools') {
        try { commands.setHiddenTools(args.tools) } catch (error) { return '保存失败：' + (error?.message || error) }
        applyToAgent(agent)
        return '已隐藏 ' + settings.disabledToolNames.length + ' 个具体工具：' +
          (settings.disabledToolNames.length ? settings.disabledToolNames.join(', ') : '无') +
          '\n\n' + await reportFor(agent)
      }
      return 'Unknown action "' + action + '". Use status, session, reset, preset or tools.'
    },
  })
  ctx.tools.register(tool)

  // `restrict()` only removes a schema from the model-facing list; a model that
  // replays a name from history still reaches dispatch. The guard makes the
  // switch a gate instead of a hint, and it is evaluated per calling agent so a
  // session override stays session-scoped.
  try {
    if (typeof ctx.tools.guard === 'function') {
      const disposeGuard = ctx.tools.guard((execution) => {
        const name = execution?.name
        if (typeof name !== 'string' || name === '') return undefined
        if (isProtectedTool(name)) return undefined
        const agent = execution?.agent
        const disabled = effectiveDisabled(agent)
        if (!toolHidden(name, disabled, settings.disabledToolNames, settings.userRules)) return undefined
        const scope = runtime.overrides.has(sessionIdOf(agent)) ? '本会话' : '全局'
        return `"${name}" 已被 Toolgate 的${scope}闸门隐藏。用 toolgate action=status 查看分组与当前闸门，或在 设置 → 工具闸门 里打开它。`
      })
      ctx.effect(() => () => { try { disposeGuard?.() } catch { /* agent scope gone */ } })
    }
  } catch (error) {
    ctx.logger?.warn?.('dsh-toolgate: dispatch guard unavailable (%s)', String(error?.message || error))
  }

  // Every request passes here before prompt assembly. Applying the restriction
  // in this hook means the schemas disappear without touching any config or
  // restarting the MCP client process.
  ctx.on('agent/pre-step', (agent, next) => {
    try { applyToAgent(agent) } catch (err) {
      console.warn('[dsh-toolgate] apply failed:', err?.message || err)
    }
    return typeof next === 'function' ? next() : undefined
  })

  // Workflow/subagent creation can begin its first step before a pre-step
  // listener attached at the root has run. Apply once at creation too, then
  // re-check on the next tick when the child's tool scope is fully installed.
  ctx.on('agent/created', (agent) => {
    try { applyToAgent(agent) } catch { /* tools not installed yet */ }
    const timer = setTimeout(() => {
      runtime.timers.delete(timer)
      try { applyToAgent(agent) } catch (err) {
        console.warn('[dsh-toolgate] child apply failed:', err?.message || err)
      }
    }, 0)
    runtime.timers.add(timer)
    if (typeof timer?.unref === 'function') timer.unref()
  })

  // Last-resort catch for workflow children whose first step is already in
  // flight when creation handlers run. `applyToAgent` is idempotent per key.
  ctx.on('agent/status', (agent) => {
    try { applyToAgent(agent) } catch { /* not a scoped agent event */ }
  })

  // Dynamic MCP managers (community dsh-mcp-manager, lazy-mcp) add/remove
  // agent-scoped tools at runtime. Rebuild the baseline and re-apply the
  // restriction on the next step; ignore the events caused by our own
  // restrict()/dispose() calls to avoid a churn loop.
  ctx.on('tools/change', () => {
    if (runtime.applying) return
    runtime.stale = true
    runtime.referenceSchemas = null
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const applied = runtime.applied.get(agent)
    if (applied) { runtime.applying = true; try { applied.dispose() } finally { runtime.applying = false } }
    runtime.applied.delete(agent)
    runtime.errors.delete(sessionIdOf(agent))
    runtime.overrides.delete(sessionIdOf(agent))
  })

  const webServer = ctx.webServer ?? (() => { try { return ctx.get('webServer') } catch { return undefined } })()
  if (webServer) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-toolgate/api',
      handler: async (req, res) => {
        const send = (code, value) => {
          res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify(value))
        }
        const header = (name) => {
          const value = req.headers?.[name]
          return Array.isArray(value) ? value[0] ?? '' : value ?? ''
        }
        // `op` lives outside the try so the failure audit below can name it.
        let op = ''
        try {
          const connection = serviceOn(ctx, 'connection')
          if (typeof connection?.requestRejection !== 'function') return send(503, { ok: false, error: 'host authentication unavailable' })
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) return send(rejection, { ok: false, error: 'request rejected by host authentication' })
          if (String(req.method || '').toUpperCase() !== 'POST') return send(405, { ok: false, error: 'method not allowed' })
          if (header('x-dsh-plugin') !== 'dsh-toolgate') return send(403, { ok: false, error: 'missing plugin gate header' })
          if (!/^application\/json(?:\s*;|$)/i.test(header('content-type'))) return send(415, { ok: false, error: 'expected application/json' })
          let payload
          try { payload = JSON.parse(await readBody(req)) } catch (error) { return send(error.status || 400, { ok: false, error: error.status === 413 ? 'request body too large' : 'invalid JSON body' }) }
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return send(400, { ok: false, error: 'expected JSON object' })
          op = String(payload.op || '')
          const args = requestArgs(payload)
          if (op === 'status') return send(200, { ok: true, ...(await groupReport(ctx)),
            applied: [...runtime.applied.keys()].map(sessionIdOf), errors: Object.fromEntries(runtime.errors) })
          if (op === 'set') commands.setHiddenGroups(args.disabled)
          else if (op === 'preset') {
            const preset = String(args.preset || '').trim().toLowerCase()
            if (!PRESET_IDS.includes(preset)) return send(400, { ok: false, error: 'unknown preset: ' + preset })
            commands.selectPreset(preset)
          } else if (op === 'tools-set') commands.setHiddenTools(args.tools)
          else if (op === 'rules-set') commands.replaceGroupingRules(args.rules)
          if (['set', 'preset', 'tools-set', 'rules-set'].includes(op)) {
            return send(200, { ok: true, ...(await groupReport(ctx)) })
          }
          if (op.startsWith('mcp-')) {
            if (!mcp) return send(503, { ok: false, error: mcpError || 'current profile unavailable' })
            const operations = {
              'mcp-list': () => mcp.listServers(),
              'mcp-add': () => mcp.addServer(args.row),
              'mcp-edit': () => mcp.editServer(args.row),
              'mcp-remove': () => mcp.removeServer(args.id),
              'mcp-enabled': () => mcp.setServerEnabled(args.id, args.enabled !== false),
            }
            if (!operations[op]) return send(400, { ok: false, error: 'unknown operation' })
            try {
              const result = operations[op]()
              if (op !== 'mcp-list') audit({ op, id: auditTarget(op, args) })
              return send(200, { ok: true, ...publicServers(result) })
            } catch (error) {
              audit({ op, id: auditTarget(op, args), error: String(error?.message || error) })
              return send(400, { ok: false, error: error.message })
            }
          }
          const skillsOps = { 'skills-list': 'list', 'skill-toggle': 'toggle', 'skill-create': 'create', 'skill-delete': 'delete' }
          if (skillsOps[op]) {
            try {
              const result = await skillManager[skillsOps[op]](args)
              if (op !== 'skills-list') audit({ op, name: String(args.name || ''), ...(op === 'skill-toggle' ? { enabled: args.enabled !== false } : {}) })
              return send(200, { ok: true, ...result })
            } catch (error) {
              audit({ op, name: String(args.name || ''), error: String(error?.message || error) })
              return send(400, { ok: false, error: error.message })
            }
          }
          return send(400, { ok: false, error: 'unknown operation: ' + op })
        } catch (err) {
          audit({ op: String(op || ''), error: String(err?.message || err) })
          send(500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-toolgate: api route')
  }
}

