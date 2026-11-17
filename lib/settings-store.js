import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizeDisabled, normalizeRule, normalizeToolList, PRESET_IDS } from './groups.js'

function decodeSettings(value) {
  const userRules = Array.isArray(value?.rules) ? value.rules.map(normalizeRule).filter(Boolean) : []
  return {
    disabledGroups: normalizeDisabled(value?.disabled, userRules),
    disabledToolNames: normalizeToolList(value?.disabledTools),
    userRules,
    preset: PRESET_IDS.includes(value?.preset) ? value.preset : 'custom',
    disabledSkills: Array.isArray(value?.disabledSkills)
      ? value.disabledSkills.filter(name => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) : [],
    skillRules: Array.isArray(value?.skillRules) ? value.skillRules.filter(rule => rule
      && typeof rule.key === 'string' && typeof rule.identity === 'string'
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.name)
      && (rule.cwd === null || typeof rule.cwd === 'string')) : [],
  }
}

// Disk keys remain compatible with existing toolgate.json files.
function encodeSettings(settings) {
  return {
    disabled: settings.disabledGroups,
    disabledTools: settings.disabledToolNames,
    rules: settings.userRules,
    preset: settings.preset,
    disabledSkills: settings.disabledSkills,
    skillRules: settings.skillRules,
  }
}

export function createSettingsStore(home) {
  const file = path.join(home, 'toolgate.json')
  const settings = decodeSettings({})
  function save(candidate = settings) {
    const temporary = file + '.' + randomUUID() + '.tmp'
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(temporary, JSON.stringify(encodeSettings(candidate), null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      fs.renameSync(temporary, file)
    } catch (error) {
      throw new Error('无法保存 Toolgate 设置：' + (error?.message || error))
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  for (const source of [file, path.join(home, 'context-budget.json')]) {
    try {
      const loaded = decodeSettings(JSON.parse(fs.readFileSync(source, 'utf8')))
      if (source !== file) save(loaded)
      Object.assign(settings, loaded)
      break
    } catch { /* unavailable or invalid settings retain defaults or the legacy source */ }
  }
  return {
    settings,
    save,
    commit(candidate) {
      // Readers keep the same object; failed persistence never publishes new settings.
      save(candidate)
      Object.assign(settings, candidate)
    },
  }
}
