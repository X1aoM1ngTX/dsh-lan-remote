/**
 * dsh-lan-remote — Host half.
 *
 * Starts an optional LAN gateway in front of this Harness Web GUI and keeps the
 * peer list the settings page manages. The gateway is a plain HTTP/WebSocket
 * proxy: the browser talks to the LAN listener, the listener talks to the
 * loopback Web server, and the Web server still owns authentication. The
 * gateway only rewrites `Host`/`Origin` to the loopback authority and turns the
 * page's share code into the process launch token the login exchange needs.
 */

import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { homedir, hostname, networkInterfaces } from 'node:os'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = '1.0.0'
const API_PREFIX = '/__lan_remote/api'
const HEALTH_PATH = '/__lan_remote/health'
const DEFAULT_PORT = 4778
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

// ---------------------------------------------------------------------------
// Durable state
// ---------------------------------------------------------------------------

function stateFile() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'lan-remote', 'state.json')
}

function defaults() {
  return { gateway: { enabled: false, port: DEFAULT_PORT, code: randomCode(), lastError: null }, peers: [] }
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : DEFAULT_PORT
}

function readState() {
  let raw
  try {
    const text = readFileSync(stateFile(), 'utf8').replace(/^\uFEFF/, '')
    raw = JSON.parse(text)
  } catch {
    return defaults()
  }
  const gateway = raw && typeof raw.gateway === 'object' && raw.gateway ? raw.gateway : {}
  const peers = Array.isArray(raw?.peers) ? raw.peers : []
  return {
    gateway: {
      enabled: gateway.enabled === true,
      port: validPort(gateway.port),
      code: typeof gateway.code === 'string' && gateway.code.length > 0 ? gateway.code : randomCode(),
      lastError: typeof gateway.lastError === 'string' ? gateway.lastError : null,
    },
    peers: peers
      .filter((peer) => peer && typeof peer.url === 'string' && peer.url.length > 0)
      .map((peer) => ({
        id: typeof peer.id === 'string' && peer.id ? peer.id : randomBytes(6).toString('hex'),
        name: typeof peer.name === 'string' ? peer.name : '',
        url: peer.url,
        addedAt: Number.isFinite(peer.addedAt) ? peer.addedAt : Date.now(),
        lastCheck: peer.lastCheck && typeof peer.lastCheck === 'object' ? peer.lastCheck : null,
      })),
  }
}

function writeState(state) {
  const file = stateFile()
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function randomCode() {
  const bytes = randomBytes(8)
  let raw = ''
  for (const byte of bytes) raw += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function codeMatches(candidate, expected) {
  const left = Buffer.from(normalizeCode(candidate))
  const right = Buffer.from(normalizeCode(expected))
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

function lanAddresses() {
  const found = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4') continue
      if (entry.address.startsWith('169.254.')) continue
      found.push(entry.address)
    }
  }
  return found
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function peerUrl(raw) {
  const text = String(raw ?? '').trim()
  if (text.length === 0) throw new Error('请填写分享链接或地址')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
  const url = new URL(withScheme)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 或 https 地址')
  if (!url.hostname) throw new Error('地址缺少主机名')
  return url.href
}

// ---------------------------------------------------------------------------
// Host plugin
// ---------------------------------------------------------------------------

export const inject = ['webServer']

export function apply(ctx) {
  const state = readState()
  /** @type {{ server: import('node:http').Server, sockets: Set<any>, port: number, code: string, since: number, token: string|undefined, error: string|null } | null} */
  let runtime = null
  let stopping = null
  let shuttingDown = false

  const log = (message, error) => {
    if (error) console.error(`[lan-remote] ${message}`, error)
    else console.log(`[lan-remote] ${message}`)
  }

  function save() {
    try {
      writeState(state)
    } catch (error) {
      log('failed to persist state', error)
    }
  }

  function launchToken() {
    const connection = ctx.get('connection')
    if (!connection || typeof connection.authenticatedUrl !== 'function') return undefined
    try {
      const url = new URL(connection.authenticatedUrl('http://lan-remote.invalid/'))
      for (const [key, value] of url.searchParams) return { key, value }
    } catch (error) {
      log('launch token unavailable', error)
    }
    return undefined
  }

  function upstreamOrigin() {
    try {
      return new URL(ctx.webServer.getOrigin())
    } catch {
      return undefined
    }
  }

  function snapshot() {
    const addresses = lanAddresses()
    const running = runtime !== null && !shuttingDown
    const port = runtime?.port ?? state.gateway.port
    const code = runtime?.code ?? state.gateway.code
    return {
      version: VERSION,
      host: { name: hostname(), platform: process.platform, addresses },
      gateway: {
        enabled: running,
        port,
        code,
        error: runtime?.error ?? state.gateway.lastError ?? null,
        since: running ? runtime.since : null,
        urls: running ? addresses.map((address) => `http://${address}:${port}/?lan=${encodeURIComponent(code)}`) : [],
      },
      peers: state.peers,
    }
  }

  function allowed(req) {
    const connection = ctx.get('connection')
    if (!connection || typeof connection.requestRejection !== 'function') return true
    try {
      return connection.requestRejection({ headers: req.headers }) === undefined
    } catch {
      return false
    }
  }

  // -- gateway ------------------------------------------------------------

  function rewriteHeaders(headers, { upgrade = false } = {}) {
    const target = upstreamOrigin()
    if (!target) throw new Error('the local Web server is not listening')
    const next = {}
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue
      const lower = key.toLowerCase()
      if (HOP_BY_HOP.has(lower) && !(upgrade && (lower === 'connection' || lower === 'upgrade'))) continue
      if (lower === 'host' || lower === 'origin' || lower === 'referer') continue
      if (lower.startsWith('x-forwarded-') || lower === 'forwarded') continue
      next[lower] = value
    }
    next.host = target.host
    const incoming = headers.origin
    if (typeof incoming === 'string' && incoming.length > 0) next.origin = target.origin
    const referer = headers.referer
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        const parsed = new URL(referer)
        next.referer = `${target.origin}${parsed.pathname}${parsed.search}`
      } catch {
        // A malformed referer is dropped rather than forwarded.
      }
    }
    return next
  }

  function sanitizeResponseHeaders(headers) {
    const next = {}
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      next[key] = value
    }
    return next
  }

  function proxy(req, res, path, { buffer = false } = {}) {
    const target = upstreamOrigin()
    if (!target) {
      sendText(res, 502, '本机 DSH Web 服务未就绪，无法转发。')
      return
    }
    let headers
    try {
      headers = rewriteHeaders(req.headers)
    } catch (error) {
      sendText(res, 502, String(error?.message ?? error))
      return
    }
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
    const upstream = transport({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path,
      headers,
    }, (response) => {
      const status = response.statusCode ?? 502
      if (buffer) {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          if (status === 401) {
            sendText(res, 200, loginPage('登录状态已过期，请重新输入访问码。'), 'text/html; charset=utf-8')
            return
          }
          res.writeHead(status, sanitizeResponseHeaders(response.headers))
          res.end(Buffer.concat(chunks))
        })
        response.on('error', () => res.destroy())
        return
      }
      res.writeHead(status, sanitizeResponseHeaders(response.headers))
      res.flushHeaders()
      response.pipe(res)
      response.on('error', () => res.destroy())
    })
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      sendText(res, 502, `无法连接到本机 DSH Web 服务：${error?.code ?? error?.message ?? error}`)
    })
    if (req.method === 'GET' || req.method === 'HEAD' || !req.readable) upstream.end()
    else req.pipe(upstream)
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })
  }

  function proxyUpgrade(req, socket, head) {
    const target = upstreamOrigin()
    if (!target) {
      socket.destroy()
      return
    }
    let headers
    try {
      headers = rewriteHeaders(req.headers, { upgrade: true })
    } catch {
      socket.destroy()
      return
    }
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
    const onConnect = () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
      for (const [key, value] of Object.entries(headers)) {
        if (Array.isArray(value)) for (const entry of value) lines.push(`${key}: ${entry}`)
        else lines.push(`${key}: ${value}`)
      }
      lines.push('', '')
      upstream.write(lines.join('\r\n'))
      if (head && head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    }
    const upstream = target.protocol === 'https:'
      ? tlsConnect({ host: target.hostname, port, servername: target.hostname }, onConnect)
      : netConnect({ host: target.hostname, port }, onConnect)
    upstream.setNoDelay?.(true)
    socket.setNoDelay?.(true)
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
  }

  function loginPage(error) {
    const name = escapeHtml(hostname())
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 局域网远程 · ${name}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: #0f1115; color: #e8eaed; }
  form { width: min(380px, calc(100vw - 48px)); padding: 28px; border-radius: 14px;
    background: #171a21; border: 1px solid #262b36; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
  h1 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
  p { margin: 0 0 18px; color: #9aa3b2; font-size: 13px; }
  label { display: block; font-size: 12px; color: #9aa3b2; margin-bottom: 6px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #2c3340; background: #10131a; color: #e8eaed; font-size: 15px;
    letter-spacing: .12em; text-transform: uppercase; }
  input:focus { outline: 2px solid #247bbf; outline-offset: 1px; }
  button { margin-top: 14px; width: 100%; padding: 10px 12px; border-radius: 8px; border: 0;
    background: #247bbf; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  .err { margin-top: 14px; padding: 9px 11px; border-radius: 8px; background: #3a1d20;
    border: 1px solid #5c2a30; color: #ffb4b4; font-size: 12px; }
  .hint { margin-top: 14px; font-size: 12px; color: #7d8695; }
</style>
</head>
<body>
  <form method="get" action="/">
    <h1>连接到 ${name}</h1>
    <p>这台电脑已开启 DSH 局域网远程。输入它显示的访问码继续。</p>
    <label for="lan">访问码</label>
    <input id="lan" name="lan" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-1234" autofocus>
    <button type="submit">连接</button>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <div class="hint">访问码由这台电脑的 DSH「设置 → 局域网远程」生成。连接即表示你信任此局域网。</div>
  </form>
</body>
</html>`
  }

  function onGatewayRequest(req, res) {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://lan.invalid')
    } catch {
      sendText(res, 400, 'bad request')
      return
    }

    if (url.pathname === HEALTH_PATH) {
      sendJson(res, 200, { app: 'dsh-lan-remote', version: VERSION, name: hostname(), gateway: true })
      return
    }

    if (url.searchParams.has('lan')) {
      const supplied = url.searchParams.get('lan')
      if (!runtime || !codeMatches(supplied, runtime.code)) {
        sendText(res, 403, loginPage('访问码不正确，请重新输入。'), 'text/html; charset=utf-8')
        return
      }
      const token = runtime.token ?? (runtime.token = launchToken())
      if (!token) {
        sendText(res, 503, loginPage('这台电脑的 DSH 尚未完成登录初始化，请稍后重试或重启 DSH。'), 'text/html; charset=utf-8')
        return
      }
      url.searchParams.delete('lan')
      url.searchParams.set(token.key, token.value)
      proxy(req, res, `${url.pathname}${url.search}`)
      return
    }

    // A first visit without the cookie lands on the login form instead of the
    // Web server's bare 401. The exchange itself owns the cookie.
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/') {
      if (!req.headers.cookie) {
        sendText(res, 200, loginPage(''), 'text/html; charset=utf-8')
        return
      }
      proxy(req, res, `${url.pathname}${url.search}`, { buffer: true })
      return
    }

    proxy(req, res, req.url ?? '/')
  }

  async function stopGateway() {
    if (stopping) {
      await stopping
      return
    }
    const current = runtime
    if (!current) return
    runtime = null
    stopping = new Promise((resolve) => {
      for (const socket of current.sockets) socket.destroy()
      const timer = setTimeout(resolve, 800)
      current.server.close(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    await stopping
    stopping = null
    shuttingDown = false
  }

  async function startGateway(port) {
    await stopGateway()
    shuttingDown = false
    const nextPort = validPort(Number(port))
    const code = state.gateway.code || randomCode()
    const sockets = new Set()
    const server = createServer(onGatewayRequest)
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
    server.on('upgrade', (req, socket, head) => proxyUpgrade(req, socket, head))
    server.on('error', (error) => {
      log('gateway error', error)
      if (runtime && runtime.server === server) runtime.error = error?.code === 'EADDRINUSE' ? '端口已被占用' : String(error?.message ?? error)
    })
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen({ host: '0.0.0.0', port: nextPort })
    })
    runtime = { server, sockets, port: nextPort, code, since: Date.now(), token: undefined, error: null }
    state.gateway.enabled = true
    state.gateway.port = nextPort
    state.gateway.code = code
    state.gateway.lastError = null
    save()
    log(`gateway listening on 0.0.0.0:${nextPort}`)
  }

  // -- routes -------------------------------------------------------------

  const routes = [
    {
      kind: 'exact',
      path: HEALTH_PATH,
      handler: (req, res) => {
        sendJson(res, 200, { app: 'dsh-lan-remote', version: VERSION, name: hostname(), gateway: runtime !== null && !shuttingDown })
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/state`,
      handler: (req, res) => {
        if (!allowed(req)) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        sendJson(res, 200, snapshot())
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/gateway`,
      handler: async (req, res) => {
        if (!allowed(req)) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        try {
          const body = await readJson(req)
          let after = null
          if (body.regenerate === true) {
            state.gateway.code = randomCode()
            if (runtime) runtime.code = state.gateway.code
            save()
          }
          if (typeof body.port === 'number' || typeof body.port === 'string') {
            state.gateway.port = validPort(Number(body.port))
            save()
            if (runtime && runtime.port !== state.gateway.port) after = () => startGateway(state.gateway.port)
          }
          if (body.enabled === true) {
            if (runtime === null) await startGateway(state.gateway.port)
          } else if (body.enabled === false) {
            shuttingDown = runtime !== null
            state.gateway.enabled = false
            state.gateway.lastError = null
            save()
            // Answer first: stopping destroys the sockets that carry this reply.
            if (shuttingDown) after = () => stopGateway()
          }
          sendJson(res, 200, snapshot())
          if (after) {
            // Let the answer leave the socket before a restart or stop owns it.
            res.on('finish', () => setTimeout(() => void after().catch((error) => log('deferred gateway change failed', error)), 150))
          }
        } catch (error) {
          const message = error?.code === 'EADDRINUSE'
            ? `端口 ${state.gateway.port} 已被占用，请换一个端口`
            : String(error?.message ?? error)
          state.gateway.lastError = message
          save()
          sendJson(res, 400, { error: message })
        }
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/peers`,
      handler: async (req, res) => {
        if (!allowed(req)) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        try {
          const body = await readJson(req)
          const action = body.action
          if (action === 'add') {
            const url = peerUrl(body.url)
            const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
            state.peers.push({ id: randomBytes(6).toString('hex'), name, url, addedAt: Date.now(), lastCheck: null })
            save()
          } else if (action === 'remove') {
            state.peers = state.peers.filter((peer) => peer.id !== body.id)
            save()
          } else if (action === 'probe') {
            const peer = state.peers.find((entry) => entry.id === body.id)
            if (!peer) throw new Error('找不到这台电脑')
            peer.lastCheck = await probe(peer)
            save()
          } else {
            throw new Error('未知操作')
          }
          sendJson(res, 200, snapshot())
        } catch (error) {
          sendJson(res, 400, { error: String(error?.message ?? error) })
        }
      },
    },
  ]

  const disposers = routes.map((route) => ctx.webServer.register(route))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // The route owner may already be gone.
      }
    }
    void stopGateway()
  })

  async function probe(peer) {
    const started = Date.now()
    const origin = new URL(peer.url).origin
    try {
      const response = await fetch(`${origin}${HEALTH_PATH}`, {
        signal: AbortSignal.timeout(3000),
        headers: { accept: 'application/json' },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.app !== 'dsh-lan-remote') {
        return { ok: false, at: Date.now(), latencyMs: Date.now() - started, error: `对方响应异常（HTTP ${response.status}）` }
      }
      return { ok: true, at: Date.now(), latencyMs: Date.now() - started, error: null, name: payload.name ?? '' }
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? '连接超时' : (error?.cause?.code ?? error?.code ?? error?.message ?? String(error))
      return { ok: false, at: Date.now(), latencyMs: Date.now() - started, error: String(reason) }
    }
  }

  if (state.gateway.enabled) {
    startGateway(state.gateway.port).catch((error) => {
      log('failed to restore the gateway', error)
      state.gateway.enabled = false
      state.gateway.lastError = error?.code === 'EADDRINUSE'
        ? `端口 ${state.gateway.port} 已被占用`
        : String(error?.message ?? error)
      save()
    })
  }
}
