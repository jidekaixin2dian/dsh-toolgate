import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSettingsStore } from '../lib/settings-store.js'
import { createGateCommands } from '../lib/gate-commands.js'
import { serviceOn } from '../lib/host-paths.js'

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-settings-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const store = createSettingsStore(home)
  const events = []
  const commands = createGateCommands(store, { audit: entry => events.push(entry), invalidate: () => events.push('invalidate') })
  return { home, file: path.join(home, 'toolgate.json'), store, commands, events }
}

test('shared commands retain disk keys and protected tools across presets and exact selection', t => {
  const { file, store, commands } = fixture(t)
  commands.selectPreset('lite')
  assert.equal(store.settings.preset, 'lite')
  assert.ok(store.settings.disabledGroups.includes('ego'))
  assert.ok(!store.settings.disabledGroups.includes('skills'))
  commands.setHiddenTools(['read', 'apply_patch', 'ego_click'])
  assert.deepEqual(store.settings.disabledToolNames, ['ego_click'])
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(disk.disabledTools, ['ego_click'])
  assert.equal(disk.preset, 'custom')
  assert.equal('disabledToolNames' in disk, false)
  assert.equal('applied' in disk, false)
})

test('failed rule replacement preserves both rules and pruned groups, and does not invalidate', t => {
  const { file, store, commands, events } = fixture(t)
  commands.replaceGroupingRules([{ id: 'custom', prefixes: ['custom_'] }])
  commands.setHiddenGroups(['custom'])
  const before = structuredClone(store.settings)
  const count = events.length
  fs.unlinkSync(file)
  fs.mkdirSync(file)
  assert.throws(() => commands.replaceGroupingRules([]), /无法保存/)
  assert.deepEqual(store.settings, before)
  assert.equal(events.length, count)
})

test('failed group selection retains the named preset as well as its disabled groups', t => {
  const { file, store, commands } = fixture(t)
  commands.selectPreset('standard')
  const before = structuredClone(store.settings)
  fs.unlinkSync(file)
  fs.mkdirSync(file)
  assert.throws(() => commands.setHiddenGroups([]), /无法保存/)
  assert.deepEqual(store.settings, before)
})

test('legacy settings migrate without changing skill identities or custom rules', t => {
  const { home, file } = fixture(t)
  fs.writeFileSync(path.join(home, 'context-budget.json'), JSON.stringify({
    disabled: ['custom'], rules: [{ id: 'custom', prefixes: ['custom_'] }], disabledTools: ['ego_click'],
    skillRules: [{ key: 'key', identity: 'identity', name: 'demo', cwd: null }],
  }))
  const { settings } = createSettingsStore(home)
  assert.deepEqual(settings.disabledGroups, ['custom'])
  assert.equal(settings.skillRules[0].identity, 'identity')
  assert.ok(fs.existsSync(file))
})

test('optional host services fall back on an absent registration and preserve throwing getters', () => {
  const direct = {}
  assert.equal(serviceOn({ get: () => undefined, tools: direct }, 'tools'), direct)
  assert.equal(serviceOn({ get() { throw new Error('undeclared') } }, 'tools'), undefined)
})
