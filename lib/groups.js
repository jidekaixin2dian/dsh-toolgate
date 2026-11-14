// Pure grouping rules. Kept dependency-free so node --test can exercise them
// without loading the DSH host or @deepseek-ai/dsh-tools.
//
// v0.2 — groups are data, not code:
//   * `DEFAULT_RULES` ships the built-in buckets (ego / remote / watch / team …)
//   * `toolgate.json` may add or override rules by id
//   * anything left over still lands in `core`, which is never hideable
//   * `deriveSuggestions()` proposes groups for ungrouped prefixes, so a new
//     plugin's tools show up as a suggestion instead of silently joining core

/** Reserved buckets whose labels are fixed regardless of rules. */
export const FIXED_LABELS = {
  skills: 'Skill 目录',
  memory: '记忆工具',
  schedule: '定时任务',
  ego: 'Ego 浏览器',
  remote: '远程会话',
  watch: '仓库巡检',
  team: '团队任务',
  job: '后台作业',
}
export const CORE_LABEL = '核心工具'

/** Never hideable, whatever the config says. Hiding pwsh or the tool itself
 *  locks the session out of its own escape hatch.
 *  `apply_patch` (DSH 0.2.2+) is the multi-file equivalent of write/edit, so it
 *  belongs to the same escape-hatch class: hiding it would leave the model with
 *  a "protected" write path that still cannot create or delete files. */
export const PROTECTED_TOOLS = Object.freeze([
  'read', 'write', 'edit', 'apply_patch', 'glob', 'grep', 'pwsh', 'present',
  'todo_write', 'toolgate', 'ask_user_question',
])

/**
 * Shipped rules. Order matters: first match wins, so a more specific prefix
 * belongs above a broader one. `exact` matches the whole tool name.
 * @type {ReadonlyArray<{id: string, prefixes: string[], exact?: string[]}>}
 */
export const DEFAULT_RULES = Object.freeze([
  Object.freeze({ id: 'ego', prefixes: ['ego_'] }),
  Object.freeze({ id: 'memory', prefixes: ['mnemon_'] }),
  Object.freeze({ id: 'remote', prefixes: ['remote_'] }),
  Object.freeze({ id: 'watch', prefixes: ['watch_'] }),
  Object.freeze({ id: 'schedule', prefixes: ['schedule_'] }),
  Object.freeze({ id: 'team', prefixes: ['team_task_'] }),
])

/** One-tap configurations. `skills` is never hidden by a preset. */
export const PRESETS = Object.freeze({
  full: Object.freeze([]),
  standard: Object.freeze(['ego', 'watch', 'remote']),
  lite: Object.freeze(['ego', 'watch', 'remote', 'team', 'schedule', 'memory']),
})

export const PRESET_IDS = Object.freeze(Object.keys(PRESETS))

const ID_RE = /^[a-z0-9][a-z0-9:_-]{0,39}$/
const MCP_ID_RE = /^mcp:[a-z0-9_-]{1,32}$/
const RESERVED_IDS = new Set(['skills', 'memory', 'schedule', 'mcp'])

function cleanStrings(value, limit = 8) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    const text = String(raw || '').trim()
    if (!text || text.length > 64) continue
    if (!out.includes(text)) out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/** Validate one user rule. Returns null when it would be unsafe or unusable. */
export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null
  const id = String(rule.id || '').trim().toLowerCase()
  if (!ID_RE.test(id) || id === 'core') return null
  const prefixes = cleanStrings(rule.prefixes).filter(prefix => /^[A-Za-z0-9_.:-]+$/.test(prefix))
  const exact = cleanStrings(rule.exact).filter(name => /^[A-Za-z0-9_.:-]+$/.test(name))
  if (prefixes.length === 0 && exact.length === 0) return null
  const label = typeof rule.label === 'string' && rule.label.trim() !== ''
    ? rule.label.trim().slice(0, 48)
    : undefined
  return { id, prefixes, exact, ...(label ? { label } : {}) }
}

/**
 * Merge shipped rules with user rules. A user rule with the same id replaces
 * the shipped one in place, so ordering stays stable and overrides are obvious.
 */
export function normalizeRules(rules) {
  const user = (Array.isArray(rules) ? rules : []).map(normalizeRule).filter(Boolean)
  const merged = []
  for (const base of DEFAULT_RULES) {
    const override = user.find(rule => rule.id === base.id)
    merged.push(Object.freeze(override ? { ...base, ...override } : { ...base }))
  }
  for (const rule of user) {
    if (!merged.some(entry => entry.id === rule.id)) merged.push(Object.freeze(rule))
  }
  return merged
}

/** Every id that may appear in a `disabled` list. */
export function knownGroupIds(rules) {
  const ids = new Set(RESERVED_IDS)
  ids.add('mcp')
  for (const rule of normalizeRules(rules)) ids.add(rule.id)
  return ids
}

export function groupOf(toolName, rules) {
  const n = String(toolName || '')
  if (n.startsWith('mcp__')) {
    const rest = n.slice(5)
    const cut = rest.indexOf('__')
    const server = cut > 0 ? rest.slice(0, cut) : 'other'
    return 'mcp:' + (server.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32) || 'other')
  }
  if (n === 'skill') return 'skills'
  for (const rule of normalizeRules(rules)) {
    if (rule.exact && rule.exact.includes(n)) return rule.id
    for (const prefix of rule.prefixes) {
      if (n.startsWith(prefix)) return rule.id
    }
  }
  return 'core'
}

export function labelOf(group, rules) {
  if (group === 'core') return CORE_LABEL
  if (group.startsWith('mcp:')) return 'MCP · ' + group.slice(4)
  if (FIXED_LABELS[group]) return FIXED_LABELS[group]
  const rule = normalizeRules(rules).find(entry => entry.id === group)
  return rule?.label || group
}

export function normalizeDisabled(value, rules) {
  if (!Array.isArray(value)) return []
  const known = knownGroupIds(rules)
  const out = new Set()
  for (const raw of value) {
    let id = String(raw || '').trim().toLowerCase()
    // Migrate the pre-market fixed groups to generic MCP server ids.
    if (id === 'rea') id = 'mcp:rea'
    if (id === 'mcp_other') id = 'mcp:other'
    if (id === 'mcp') { out.add('mcp'); continue }
    if (MCP_ID_RE.test(id)) { out.add(id); continue }
    if (known.has(id)) out.add(id)
  }
  return [...out]
}

/** Exact tool names to hide, validated and de-duplicated. */
export function normalizeToolList(value) {
  if (!Array.isArray(value)) return []
  const out = new Set()
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const name = raw.trim()
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(name)) continue
    if (PROTECTED_TOOLS.includes(name)) continue
    out.add(name)
  }
  return [...out]
}

export function isDisabled(group, disabled) {
  if (group === 'core') return false
  return disabled.includes(group) || (group.startsWith('mcp:') && disabled.includes('mcp'))
}

/**
 * Whether a gate is worth applying at all. Both halves count: a session that
 * disables no group but names individual tools must still be restricted, and
 * forgetting this is exactly how the per-tool switch once became a no-op.
 */
export function shouldApplyGate(disabled, disabledTools) {
  const groups = Array.isArray(disabled) ? disabled.length : 0
  const tools = Array.isArray(disabledTools) ? disabledTools.length : 0
  return groups > 0 || tools > 0
}

export function matchesDisabled(toolName, disabled, rules) {
  return isDisabled(groupOf(toolName, rules), disabled)
}

/** True when this tool must not reach the model: group off or listed by name. */
export function toolHidden(toolName, disabled, disabledTools, rules) {
  const name = String(toolName || '')
  if (PROTECTED_TOOLS.includes(name)) return false
  if (Array.isArray(disabledTools) && disabledTools.includes(name)) return true
  return matchesDisabled(name, disabled, rules)
}

/**
 * Propose groups for tools still sitting in `core`. A prefix shared by at
 * least `min` tools is a real cluster, not a coincidence: `job_list`,
 * `job_output`, `job_kill` → `job`. Suggestions are advisory only; the user
 * turns one into a rule from the settings page.
 */
export function deriveSuggestions(toolNames, rules, min = 3) {
  const taken = new Set(normalizeRules(rules).map(rule => rule.id))
  const buckets = new Map()
  for (const name of Array.isArray(toolNames) ? toolNames : []) {
    if (typeof name !== 'string' || name === '') continue
    if (groupOf(name, rules) !== 'core') continue
    const cut = name.indexOf('_')
    if (cut < 2) continue
    const prefix = name.slice(0, cut) + '_'
    if (!buckets.has(prefix)) buckets.set(prefix, [])
    buckets.get(prefix).push(name)
  }
  const out = []
  for (const [prefix, names] of buckets) {
    if (names.length < min) continue
    const id = prefix.slice(0, -1).toLowerCase()
    if (!ID_RE.test(id) || taken.has(id)) continue
    out.push({ id, prefixes: [prefix], tools: names.slice(0, 12), count: names.length })
  }
  return out.sort((a, b) => b.count - a.count)
}
