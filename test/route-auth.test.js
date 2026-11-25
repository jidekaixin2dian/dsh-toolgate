import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeAuthentication, requestUrl } from '../lib/route-auth.js'

// A stand-in for node's IncomingMessage: the guard reads the method, the
// headers, the path, and the socket scheme, nothing else.
const request = ({ url = '/dsh-toolgate/api', host = '127.0.0.1:3080', method = 'POST', encrypted = false } = {}) => ({
  url,
  method,
  headers: host ? { host } : {},
  socket: { encrypted },
})

test('an admitted peer short-circuits every host probe', () => {
  let called = false
  const connection = { admit: () => { called = true; return {} } }
  assert.equal(routeAuthentication({ connection, req: request(), peer: { id: 'peer-1' } }), undefined)
  assert.equal(called, false, 'the host already admitted this request')
})

test('the 0.2.1/0.2.2 rejection seam still decides the call', () => {
  assert.equal(routeAuthentication({ connection: { requestRejection: () => undefined }, req: request() }), undefined)
  assert.deepEqual(routeAuthentication({ connection: { requestRejection: () => 401 }, req: request() }),
    { status: 401, error: 'request rejected by host authentication' })
  assert.deepEqual(routeAuthentication({ connection: { requestRejection: () => 403 }, req: request() }),
    { status: 403, error: 'request rejected by host authentication' })
})

test('the 0.2.3 admit seam admits, rejects and fails closed', () => {
  const admit = (value) => ({ admit: () => value })
  assert.equal(routeAuthentication({ connection: admit({ peer: { id: 'peer-2' } }), req: request() }), undefined)
  assert.deepEqual(routeAuthentication({ connection: admit({ rejection: 401 }), req: request() }),
    { status: 401, error: 'request rejected by host authentication' })
  assert.deepEqual(routeAuthentication({ connection: admit({ rejection: 503 }), req: request() }),
    { status: 503, error: 'request rejected by host authentication' })
})

test('a host that cannot answer never reads as an admission', () => {
  const closed = { status: 503, error: 'host authentication unavailable' }
  assert.deepEqual(routeAuthentication({ connection: undefined, req: request() }), closed)
  assert.deepEqual(routeAuthentication({ connection: {}, req: request() }), closed)
  assert.deepEqual(routeAuthentication({ connection: { admit: () => ({}) }, req: request() }), closed)
  assert.deepEqual(routeAuthentication({ connection: { admit: () => { throw new Error('offline') } }, req: request() }), closed)
})

test('the admit request carries the authority the host checks', () => {
  let seen
  const connection = { admit: (value) => { seen = value; return { peer: { id: 'peer-3' } } } }
  const req = request({ url: '/dsh-toolgate/api?x=1', host: '127.0.0.1:3080' })
  routeAuthentication({ connection, req })
  assert.equal(seen.url, 'http://127.0.0.1:3080/dsh-toolgate/api?x=1')
  assert.equal(seen.method, 'POST')
  assert.equal(seen.headers.host, '127.0.0.1:3080')
  assert.equal(seen.socket, req.socket)
})

test('requestUrl keeps the socket scheme and survives a missing Host', () => {
  assert.equal(requestUrl(request({ encrypted: true })), 'https://127.0.0.1:3080/dsh-toolgate/api')
  assert.equal(requestUrl(request({ host: null })), '/dsh-toolgate/api')
  assert.equal(requestUrl({}), '/')
})