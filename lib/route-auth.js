// Host authentication for the management route (`/dsh-toolgate/api`).
//
// The public plugin header is a request marker, never a credential: every call
// has to be admitted by the running host. DSH moved that seam twice, so accept
// every generation, newest first:
//
// * 0.2.3: routes declare `auth: 'required'`, the host hands an admitted Peer
//   to the handler, and `connection.admit(request)` answers `{ peer }` or
//   `{ rejection: 401 | 403 | 503 }`.
// * 0.2.1 - 0.2.2: `connection.requestRejection(req)` returns a status code or
//   undefined.
//
// A host that exposes none of them closes the endpoint instead of guessing:
// silently serving an unauthenticated settings route is the failure this guard
// exists to prevent.

const unavailable = Object.freeze({ status: 503, error: 'host authentication unavailable' })

function header(req, name) {
  const value = req?.headers?.[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

// Rebuild the request URL a ConnectionTrustRequest expects. The handler only
// receives `req.url` (a path), so the Host header supplies the authority and
// the socket supplies the scheme.
export function requestUrl(req) {
  const path = req?.url || '/'
  const host = header(req, 'host')
  if (!host) return path
  return `${req?.socket?.encrypted ? 'https' : 'http'}://${host}${path}`
}

export function routeAuthentication({ connection, req, peer }) {
  // The host already admitted this request: its route auth policy ran before
  // the handler, so a Peer is stronger evidence than re-checking a header.
  if (peer !== undefined) return undefined
  if (typeof connection?.requestRejection === 'function') {
    const rejection = connection.requestRejection(req)
    return rejection === undefined ? undefined : { status: rejection, error: 'request rejected by host authentication' }
  }
  if (typeof connection?.admit === 'function') {
    let admission
    try {
      admission = connection.admit({
        headers: req?.headers ?? {},
        ...(req?.method ? { method: req.method } : {}),
        url: requestUrl(req),
        ...(req?.signal ? { signal: req.signal } : {}),
        ...(req?.socket ? { socket: req.socket } : {}),
      })
    } catch {
      // A host that cannot answer is not an admitted request.
      return unavailable
    }
    if (admission?.peer !== undefined) return undefined
    const rejection = admission?.rejection
    return typeof rejection === 'number' ? { status: rejection, error: 'request rejected by host authentication' } : unavailable
  }
  return unavailable
}