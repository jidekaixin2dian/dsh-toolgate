import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addServer, createMcpConfig, editServer, listServers, removeServer, setServerEnabled } from '../lib/mcp-config.js'

function withTempProfile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mcp-'))
  const profile = path.join(root, 'profiles', 'desktop')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), '[]\n')
  fs.writeFileSync(path.join(root, 'cordis.patch.yml'), '[]\n')
  const oldProfile = process.env.DSH_TOOLGATE_PROFILE_DIR
  const oldHome = process.env.DSH_TOOLGATE_HOME
  process.env.DSH_TOOLGATE_PROFILE_DIR = profile
  process.env.DSH_TOOLGATE_HOME = root
  return {
    root,
    restore() {
      if (oldProfile === undefined) delete process.env.DSH_TOOLGATE_PROFILE_DIR
      else process.env.DSH_TOOLGATE_PROFILE_DIR = oldProfile
      if (oldHome === undefined) delete process.env.DSH_TOOLGATE_HOME
      else process.env.DSH_TOOLGATE_HOME = oldHome
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

test('MCP add / edit / disable / remove round-trip', () => {
  const temp = withTempProfile()
  try {
    addServer({
      serverName: 'demo', transport: 'stdio', command: 'npx',
      args: ['-y', 'pkg'], env: 'TOKEN=secret',
    })
    let listing = listServers()
    assert.equal(listing.rows.length, 1)
    assert.equal(listing.rows[0].config.serverName, 'demo')
    assert.deepEqual(listing.rows[0].config.args, ['-y', 'pkg'])
    assert.equal(listing.rows[0].config.env.TOKEN, 'secret')

    setServerEnabled('demo', false)
    listing = listServers()
    assert.equal(listing.rows[0].disabled, true)
    setServerEnabled('demo', true)
    listing = listServers()
    assert.equal(listing.rows[0].disabled, false)

    editServer({ id: 'demo', serverName: 'demo', transport: 'streamable-http', url: 'http://localhost:3000/mcp', headers: 'Authorization=Bearer x' })
    listing = listServers()
    assert.equal(listing.rows[0].config.transport, 'streamable-http')
    assert.equal(listing.rows[0].config.url, 'http://localhost:3000/mcp')
    assert.equal(listing.rows[0].config.headers.Authorization, 'Bearer x')

    removeServer('demo')
    assert.equal(listServers().rows.length, 0)
  } finally {
    temp.restore()
  }
})

test('MCP listing survives composer results that are not entry arrays', () => {
  const temp = withTempProfile()
  try {
    const row = { id: 'demo', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'demo', transport: 'stdio', command: 'npx' } }
    const shapes = [
      ['plain array', [], 0],
      ['undefined', undefined, 0],
      ['empty object', {}, 0],
      ['{ rows: [] }', { rows: [] }, 0],
      ['{ servers: [] }', { servers: [] }, 0],
      ['host PatchResult (empty)', { data: [], index: {} }, 0],
      ['host PatchResult (one server)', { data: [row], index: {} }, 1],
    ]
    for (const [label, shape, expected] of shapes) {
      const listing = createMcpConfig({ compose: () => shape }).listServers()
      assert.ok(Array.isArray(listing.rows), label)
      assert.equal(listing.rows.length, expected, label)
    }
    const listing = createMcpConfig({ compose: () => ({ data: [row], index: {} }) }).listServers()
    assert.equal(listing.rows[0].id, 'demo')
    assert.equal(listing.rows[0].level, 'bundle')
    assert.equal(listing.rows[0].editable, false)
    const withWrappedBase = createMcpConfig({ compose: () => [], basePatches: () => ({ data: [] }), overlays: { rows: [] } }).listServers()
    assert.deepEqual(withWrappedBase.rows, [])
  } finally {
    temp.restore()
  }
})

test('MCP level is preserved for global rows', () => {
  const temp = withTempProfile()
  try {
    addServer({ serverName: 'gdemo', transport: 'stdio', command: 'npx', level: 'global' })
    let listing = listServers()
    assert.equal(listing.rows[0].level, 'global')
    editServer({ id: 'gdemo', serverName: 'gdemo', transport: 'stdio', command: 'node', level: 'global' })
    listing = listServers()
    assert.equal(listing.rows[0].level, 'global')
    assert.equal(listing.rows[0].config.command, 'node')
    removeServer('gdemo')
    assert.equal(listServers().rows.length, 0)
  } finally {
    temp.restore()
  }
})


