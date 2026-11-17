import { normalizeDisabled, normalizeRule, normalizeToolList, PRESETS, PRESET_IDS } from './groups.js'

export function createGateCommands(store, { audit, invalidate }) {
  const settings = store.settings
  function commit(candidate, entry) {
    store.commit(candidate)
    audit(entry)
    invalidate()
  }
  return {
    setHiddenGroups(groups) {
      const disabledGroups = normalizeDisabled(groups, settings.userRules)
      commit({ ...settings, disabledGroups, preset: 'custom' }, { op: 'set', disabled: disabledGroups })
    },
    setHiddenTools(names) {
      const disabledToolNames = normalizeToolList(names)
      commit({ ...settings, disabledToolNames, preset: 'custom' }, { op: 'tools-set', tools: disabledToolNames })
    },
    selectPreset(value) {
      const preset = String(value || '').trim().toLowerCase()
      if (!PRESET_IDS.includes(preset)) throw new Error('unknown preset: ' + preset)
      const disabledGroups = normalizeDisabled(PRESETS[preset], settings.userRules)
      commit({ ...settings, disabledGroups, preset }, { op: 'preset', preset, disabled: disabledGroups })
    },
    replaceGroupingRules(value) {
      const userRules = (Array.isArray(value) ? value : []).map(normalizeRule).filter(Boolean)
      const disabledGroups = normalizeDisabled(settings.disabledGroups, userRules)
      commit({ ...settings, userRules, disabledGroups }, { op: 'rules-set', rules: userRules.map(rule => rule.id) })
    },
  }
}
