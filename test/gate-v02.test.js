import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

// This file drives the real plugin entry point, which imports the DSH host
// packages (`@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`). They are
// optional peers of this plugin and are not installed by `npm ci`, so on a
// bare checkout the whole file reports as skipped instead of failing. Point
// `node_modules` at a DSH install (or a profile) to run it for real.
const hostPeers = await (async () => {
  try {
    return await import('../lib/index.js')
  } catch (error) {
    return { error: String(error?.message || error) }
  }
})()
const available = typeof hostPeers.apply === 'function'
const skipReason = available
  ? false
  : 'DSH 运行时 peer 不在 node_modules（expected on a bare checkout）：' +
    String(hostPeers.error || '').slice(0, 160)

const check = (name, fn) => (available ? test(name, fn) : test(name, { skip: skipReason }, () => {}))

// One stub host per file; the plugin resolves its state file from DSH_HOME.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'toolgate-gate-'))
process.env.DSH_HOME = home

const schemas = [
  { name: 'read', description: 'read', parameters: {} },
  { name: 'pwsh', description: 'shell', parameters: {} },
  { name: 'toolgate', description: 'gate', parameters: {} },
  { name: 'ego_navigate', description: 'open', parameters: {} },
  { name: 'ego_click', description: 'click', parameters: {} },
  { name: 'mnemon_recall', description: 'recall', parameters: {} },
]

const registered = []
const guards = []
const restricts = []
const routes = []
const events = {}
let denied = new Set()

const skillsSvc = {
  list: async () => [{ name: 'demo', description: 'a demo skill' }],
  get: async () => undefined,
  registerProvider: (factory) => factory({ invalidate() {} }),
}
const services = { connection: { requestRejection: () => undefined }, skills: skillsSvc, tools: null }
const toolsSvc = {
  // An agent-scoped view honours the active restriction, so the tests observe
  // the real effect instead of trusting the deny list alone.
  schemas: (agent) => (agent ? schemas.filter(schema => !denied.has(schema.name)) : schemas),
  register: (tool) => registered.push(tool),
  guard: (fn) => { guards.push(fn); return () => { guards.length = 0 } },
  restrict: (options) => {
    restricts.push(options)
    const previous = denied
    denied = new Set(options.deny)
    return () => { denied = previous }
  },
}
services.tools = toolsSvc
const ctx = {
  tools: toolsSvc,
  skills: skillsSvc,
  webServer: { register: (route) => { routes.push(route); return () => {} } },
  effect: (fn) => fn(),
  on: (name, fn) => { events[name] = fn },
  get: (name) => services[name],
  logger: { warn() {} },
}

let tool = null
let agent = null
if (available) {
  await hostPeers.apply(ctx, {})
  agent = { session: { id: 'gate-1' }, ctx }
  tool = registered[0]
}

const readState = () => JSON.parse(fs.readFileSync(path.join(home, 'toolgate.json'), 'utf8'))
const http = (payload) => new Promise((resolve) => {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))])
  req.method = 'POST'
  req.headers = { 'x-dsh-plugin': 'dsh-toolgate', 'content-type': 'application/json' }
  const res = {
    writeHead: (code) => { res.code = code },
    end: (body) => resolve({ code: res.code, body: JSON.parse(body) }),
  }
  routes[0].handler(req, res)
})

check('apply() registers one tool, one guard and one route', () => {
  assert.equal(registered.length, 1)
  assert.equal(tool.name, 'toolgate')
  assert.equal(guards.length, 1)
  assert.equal(routes.length, 1)
  assert.ok(events['agent/pre-step'])
})

check('status discovers groups from the registered tools', async () => {
  const text = await tool.execute({ action: 'status' }, { agent })
  assert.match(text, /Toolgate/)
  assert.match(text, /ego .*2 个/)
})

check('preset lite hides the big groups and never the skill catalog', async () => {
  await tool.execute({ action: 'preset', preset: 'lite' }, { agent })
  const saved = readState()
  assert.equal(saved.preset, 'lite')
  assert.ok(saved.disabled.includes('ego'))
  assert.ok(!saved.disabled.includes('skills'))
  // ego (2 tools) + memory (1 tool) exist in this stub.
  assert.equal(ctx.tools.schemas(agent).length, schemas.length - 3)
})

check('the dispatch guard refuses hidden tools but keeps the escape hatches', () => {
  const guard = guards[0]
  assert.equal(guard({ name: 'pwsh', agent }), undefined)
  assert.match(String(guard({ name: 'ego_click', agent })), /Toolgate/)
})

check('an exact tool list reaches restrict() with no group disabled', async () => {
  await tool.execute({ action: 'preset', preset: 'full' }, { agent })
  restricts.length = 0
  await tool.execute({ action: 'tools', tools: ['ego_click'] }, { agent })
  assert.ok(restricts.length > 0, 'restrict() was not called')
  assert.ok(restricts[restricts.length - 1].deny.includes('ego_click'))
  assert.equal(ctx.tools.schemas(agent).length, schemas.length - 1)
  assert.deepEqual(readState().disabledTools, ['ego_click'])
})

check('clearing the exact list lifts the restriction', async () => {
  await tool.execute({ action: 'tools', tools: [] }, { agent })
  assert.equal(ctx.tools.schemas(agent).length, schemas.length)
})

check('protected tools cannot be hidden by name', async () => {
  await tool.execute({ action: 'tools', tools: ['pwsh', 'read'] }, { agent })
  assert.deepEqual(readState().disabledTools, [])
})

check('a session override is reported as such and does not touch the global gate', async () => {
  await tool.execute({ action: 'preset', preset: 'full' }, { agent })
  await tool.execute({ action: 'session', disabled: ['ego'] }, { agent })
  const text = await tool.execute({ action: 'status' }, { agent })
  assert.match(text, /本会话覆盖/)
  assert.match(text, /ego .*\[已隐藏\]/)
  const count = Number((text.match(/当前:.*\/\s*(\d+)\s*个工具/) || [])[1])
  assert.equal(count, schemas.length - 2)
  assert.deepEqual(readState().disabled, [], 'session override leaked into the global gate')
})

check('unknown names in the exact list are reported instead of failing silently', async () => {
  await tool.execute({ action: 'tools', tools: ['ego_click', 'gone_tool'] }, { agent })
  const status = await http({ op: 'status' })
  assert.deepEqual(status.body.unknownTools, ['gone_tool'])
  assert.ok(status.body.groups.some(group => group.id === 'ego' && group.tools.length === 2))
})

check('http preset round-trips and rejects an unknown preset', async () => {
  const ok = await http({ op: 'preset', preset: 'standard' })
  assert.equal(ok.code, 200)
  assert.deepEqual(ok.body.disabled.slice().sort(), ['ego', 'remote', 'watch'])
  const bad = await http({ op: 'preset', preset: 'nope' })
  assert.equal(bad.code, 400)
})
