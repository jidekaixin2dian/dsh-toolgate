import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RULES, PRESETS, PRESET_IDS, PROTECTED_TOOLS,
  deriveSuggestions, groupOf, isDisabled, labelOf, normalizeDisabled,
  normalizeRule, normalizeRules, normalizeToolList, shouldApplyGate, toolHidden,
} from '../lib/groups.js'

test('rules drive grouping instead of a hardcoded table', () => {
  assert.equal(groupOf('ego_click'), 'ego')
  assert.equal(groupOf('remote_list_hosts'), 'remote')
  assert.equal(groupOf('watch_status'), 'watch')
  assert.equal(groupOf('team_task_list'), 'team')
  assert.equal(groupOf('read'), 'core')
})

test('a user rule can add a group and override a shipped one', () => {
  assert.equal(groupOf('job_list', [{ id: 'job', prefixes: ['job_'] }]), 'job')
  const overridden = normalizeRules([{ id: 'ego', prefixes: ['browser_'] }])
  assert.deepEqual(overridden.find(rule => rule.id === 'ego').prefixes, ['browser_'])
  assert.equal(groupOf('ego_click', overridden), 'core')
  assert.equal(groupOf('browser_open', overridden), 'ego')
})

test('unsafe or empty rules are dropped', () => {
  assert.equal(normalizeRule({ id: 'core', prefixes: ['x_'] }), null)
  assert.equal(normalizeRule({ id: 'Bad Id', prefixes: ['x_'] }), null)
  assert.equal(normalizeRule({ id: 'ok' }), null)
  assert.equal(normalizeRule(null), null)
})

test('disabled ids are validated against the rules that exist', () => {
  assert.deepEqual(normalizeDisabled(['ego', 'skills', 'nope', 'mcp:foo']), ['ego', 'skills', 'mcp:foo'])
  assert.deepEqual(normalizeDisabled(['job']), [])
  assert.deepEqual(normalizeDisabled(['job'], [{ id: 'job', prefixes: ['job_'] }]), ['job'])
  assert.deepEqual(normalizeDisabled('ego'), [])
})

test('protected tools stay visible under every configuration', () => {
  for (const name of PROTECTED_TOOLS) {
    assert.equal(toolHidden(name, ['core'], [name], []), false, name + ' must stay visible')
  }
  assert.equal(toolHidden('ego_click', ['ego'], [], []), true)
  assert.equal(toolHidden('ego_click', [], ['ego_click'], []), true)
  assert.equal(isDisabled('core', ['core']), false)
})

test('exact tool lists drop protected and malformed names', () => {
  assert.deepEqual(normalizeToolList(['a', 'a', 'read', 'bad name', 42]), ['a'])
  assert.deepEqual(normalizeToolList('a'), [])
})

test('a gate applies when either half is non-empty', () => {
  assert.equal(shouldApplyGate([], []), false)
  assert.equal(shouldApplyGate(['ego'], []), true)
  // The per-tool switch alone must still reach restrict(): this is the shape
  // that silently did nothing when only the group list was checked.
  assert.equal(shouldApplyGate([], ['ego_click']), true)
  assert.equal(shouldApplyGate(undefined, ['x']), true)
  assert.equal(shouldApplyGate([], undefined), false)
})

test('presets never hide the skill catalog or core', () => {
  for (const id of PRESET_IDS) {
    for (const group of PRESETS[id]) {
      assert.ok(!['core', 'skills'].includes(group), `${id} hides ${group}`)
      assert.notEqual(normalizeDisabled([group]).length, 0, `${id} names unknown group ${group}`)
    }
  }
  assert.ok(PRESETS.lite.includes('ego'))
  assert.deepEqual(PRESETS.full, [])
})

test('suggestions only fire for prefixes shared by three tools', () => {
  const names = ['job_list', 'job_output', 'job_kill', 'read', 'write', 'ego_click']
  const suggestions = deriveSuggestions(names)
  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].id, 'job')
  assert.deepEqual(suggestions[0].prefixes, ['job_'])
  assert.equal(suggestions[0].count, 3)
  assert.deepEqual(deriveSuggestions(['a_b', 'a_c']), [])
})

test('labels cover shipped groups and custom ones', () => {
  assert.equal(labelOf('core'), '核心工具')
  assert.equal(labelOf('mcp:windows'), 'MCP · windows')
  assert.equal(labelOf('ego'), 'Ego 浏览器')
  assert.equal(labelOf('job', [{ id: 'job', prefixes: ['job_'], label: '后台作业' }]), '后台作业')
  assert.ok(DEFAULT_RULES.length >= 6)
})
