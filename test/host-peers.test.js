import test from 'node:test'
import assert from 'node:assert/strict'
import { loadHostPeers } from './helpers/host-peers.js'

test('missing optional host peers can skip, but syntax and local import errors fail', async () => {
  const absent = Object.assign(new Error("Cannot find package '@deepseek-ai/dsh-tools' imported from entry.js"), { code: 'ERR_MODULE_NOT_FOUND' })
  assert.ok((await loadHostPeers(async () => { throw absent })).error)
  for (const error of [new SyntaxError('broken entry'), Object.assign(new Error('Cannot find module local.js'), { code: 'ERR_MODULE_NOT_FOUND' })]) {
    await assert.rejects(loadHostPeers(async () => { throw error }), candidate => candidate === error)
  }
})
