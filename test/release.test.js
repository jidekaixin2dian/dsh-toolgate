import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { requiredChecks, validateSource, validateChecks, validateAsset, validateChangelog } from '../scripts/release-preflight.mjs'

test('release source must be the version tag on main', () => {
  const valid = { tag: 'v0.1.5', version: '0.1.5', head: 'abc', tagged: 'abc', onMain: true,
    workflowRef: 'refs/tags/v0.1.5', workflowSha: 'abc' }
  validateSource(valid)
  for (const change of [{ tag: 'main' }, { version: '0.1.14' }, { tagged: 'other' }, { onMain: false },
    { workflowRef: 'refs/heads/main' }, { workflowSha: 'other' }]) {
    assert.throws(() => validateSource({ ...valid, ...change }))
  }
})

test('all four checks must succeed, including their latest attempt', () => {
  const checks = requiredChecks.map((name, id) => ({ name, id, head_sha: 'abc', app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }))
  validateChecks(checks, 'abc')
  assert.throws(() => validateChecks(checks.slice(1), 'abc'))
  assert.throws(() => validateChecks(checks, 'other'))
  assert.throws(() => validateChecks([...checks, { ...checks[0], id: 99, conclusion: 'failure' }], 'abc'))
  assert.throws(() => validateChecks(checks.map(check => ({ ...check, app: { slug: 'other' } })), 'abc'))
})

test('release archive selection rejects drafts, mismatched tags, and ambiguous archives', () => {
  const release = { draft: false, tag_name: 'v0.1.5', assets: [{ name: 'dsh-toolgate.tgz' }] }
  validateAsset(release, 'v0.1.5')
  for (const change of [{ draft: true }, { tag_name: 'v0.1.14' }, { assets: [] },
    { assets: [{ name: 'dsh-toolgate.tgz' }, { name: 'extra.tgz' }] }]) {
    assert.throws(() => validateAsset({ ...release, ...change }, 'v0.1.5'))
  }
})

test('the changelog for the released version must not read like a draft', () => {
  const notes = '## 0.2.0 — 2026-11-13\n\n**为什么值得更新**：这一版让分组变成数据，并且修掉按工具名隐藏不生效的问题。\n\n- 变更一\n'
  validateChangelog(notes, '0.2.0')
  // 状态词留在正式版说明里，等于告诉用户"还没发布"，会直接劝退更新。
  assert.throws(() => validateChangelog('## 0.2.0 — 2026-11-13（本地构建，未发布）\n\n- 变更一\n', '0.2.0'))
  assert.throws(() => validateChangelog('## 0.2.0 — local build, unpublished\n\n- change\n', '0.2.0'))
  // 缺段、空段也要拦。
  assert.throws(() => validateChangelog('## 0.1.9 — 2026-01-01\n\n- old\n', '0.2.0'))
  assert.throws(() => validateChangelog('## 0.2.0\n\n## 0.1.9\n\n- old\n', '0.2.0'))
})

test('the repository changelog passes for the version in package.json', () => {
  const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const text = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  validateChangelog(text, version)
})
