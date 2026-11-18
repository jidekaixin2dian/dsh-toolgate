import { deriveSuggestions, groupOf, isDisabled, labelOf, normalizeRules, toolHidden, PRESET_IDS, PROTECTED_TOOLS } from './groups.js'

const CHARS_PER_TOKEN = 3.4

export function tokensOf(value) {
  try {
    return Math.max(1, Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN))
  } catch {
    return 0
  }
}

export function buildGroupReport({ schemas, hideableNames, catalog, disabledGroups, disabledToolNames, userRules, preset }) {
  const hideable = new Set(hideableNames)
  // A session-scoped report must describe that session's gate, not the global
  // one: `hidden` flags, `saved` tokens and the returned `disabled` list all
  // follow the effective gate of the agent that asked.
  const viewDisabled = disabledGroups
  const groups = new Map()
  const ensure = (id, toggle = true) => {
    if (!groups.has(id)) {
      groups.set(id, {
        id, label: labelOf(id, userRules), count: 0, tokens: 0, hideableTokens: 0, toggle, tools: [],
      })
    }
    return groups.get(id)
  }
  for (const schema of schemas) {
    const group = groupOf(schema.name, userRules)
    const entry = ensure(group, group !== 'core')
    const tokens = tokensOf(schema)
    entry.count += 1
    entry.tokens += tokens
    // Per-tool rows feed the "one button per tool" list; cap keeps the status
    // payload small when a plugin registers dozens of tools.
    if (entry.tools.length < 80) {
      entry.tools.push({ name: schema.name, tokens, hidden: toolHidden(schema.name, viewDisabled, disabledToolNames, userRules) })
    }
    if (hideable.has(schema.name)) entry.hideableTokens += tokens
  }
  let catalogTokens = 0
  if (catalog.length > 0) {
    const entry = ensure('skills')
    entry.skillCount = catalog.length
    const catalogBytes = catalog.reduce((sum, item) => {
      return sum + String(item?.name || '').length + String(item?.description || '').length
    }, 0)
    catalogTokens = Math.ceil(catalogBytes / CHARS_PER_TOKEN)
    // `skill` schema itself is already counted above; add catalog text.
    entry.tokens += catalogTokens
    if (hideable.has('skill')) entry.hideableTokens += catalogTokens
  }
  const list = [...groups.values()].sort((a, b) => {
    if (a.id === 'core') return 1
    if (b.id === 'core') return -1
    if (a.id.startsWith('mcp:') !== b.id.startsWith('mcp:')) return a.id.startsWith('mcp:') ? -1 : 1
    return b.tokens - a.tokens
  })
  const full = list.reduce((sum, item) => sum + item.tokens, 0)
  const saved = list.filter(item => isDisabled(item.id, viewDisabled))
    .reduce((sum, item) => sum + item.hideableTokens, 0)
  // Tools the model can see but `tools.restrict()` cannot remove: they are
  // registered in the Agent's own scope, not in an inherited one.
  const scoped = schemas.filter(schema => !hideable.has(schema.name)).length
  const allNames = new Set(schemas.map(schema => schema.name))
  return {
    groups: list,
    totals: { full, current: Math.max(0, full - saved), saved },
    disabled: [...viewDisabled],
    disabledTools: [...disabledToolNames],
    // Names in the exact list that no longer exist: a typo, or a plugin that
    // went away. Surfaced instead of failing silently.
    unknownTools: disabledToolNames.filter(name => !allNames.has(name)),
    preset: preset,
    presets: PRESET_IDS,
    rules: normalizeRules(userRules).map(rule => ({ id: rule.id, prefixes: rule.prefixes, ...(rule.exact ? { exact: rule.exact } : {}), ...(rule.label ? { label: rule.label } : {}) })),
    suggestions: deriveSuggestions(schemas.map(schema => schema.name), userRules),
    protectedTools: [...PROTECTED_TOOLS],
    catalogTokens,
    scoped,
    skills: { count: catalog.length },
  }
}
