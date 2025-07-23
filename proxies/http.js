const { isAllowed } = require('../utils/ipfilter')

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET') return
  console.error('Uncaught:', err)
})

const httpProxy = require('http-proxy')
const http = require('http')
const https = require('https')
const net = require('net')
const fs = require('fs')

const HTTP_PROXY_PORT = process.env.HTTP_PROXY_PORT ? Number(process.env.HTTP_PROXY_PORT) : 8080
const HTTPS_PROXY_PORT = process.env.HTTPS_PROXY_PORT ? Number(process.env.HTTPS_PROXY_PORT) : 8443

if (HTTP_PROXY_PORT === HTTPS_PROXY_PORT) {
  console.error('ERREUR : HTTP_PROXY_PORT et HTTPS_PROXY_PORT sont identiques ! Modifie ton .env pour utiliser deux ports différents.')
  process.exit(1)
}

const HTTP_PROXY_USER = process.env.HTTP_PROXY_USER || 'user'
const HTTP_PROXY_PASS = process.env.HTTP_PROXY_PASS || 'pass'

const CERT_KEY = process.env.CERT_KEY || './certs/key.pem'
const CERT_CRT = process.env.CERT_CRT || './certs/cert.pem'

// Construction propre de la liste d'IPs autorisées (jamais de string vide)
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean)
if (!ALLOWED_IPS.length) {
  console.warn('ALLOWED_IPS vide : aucun accès ne sera autorisé !')
}

// Authentification HTTP Basic
function isAuthOK(header) {
  if (!header) return false
  const b64 = header.split(' ')[1] || ''
  const [u, p] = Buffer.from(b64, 'base64').toString().split(':')
  return u === HTTP_PROXY_USER && p === HTTP_PROXY_PASS
}

const proxy = httpProxy.createProxyServer({})

// Handler HTTP/HTTPS normal
function requestHandler(req, res) {
  let clientIp = req.socket.remoteAddress || ''
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7)
  if (clientIp === '::1') clientIp = '127.0.0.1'

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (HTTP)`)
    res.writeHead(403)
    return res.end('Forbidden: IP not allowed')
  }

  // Auth (supporte plusieurs formats)
  let authHeader = req.headers['proxy-authorization'] || req.headers['authorization']
  if (!authHeader) {
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === 'proxy-authorization') {
        authHeader = req.rawHeaders[i + 1]
      }
    }
  }

  if (!isAuthOK(authHeader)) {
    res.writeHead(407, { 'Proxy-Authenticate': 'Basic' })
    return res.end('Proxy Authentication required')
  }

  const target = req.url.startsWith('http')
    ? req.url
    : `http://${req.headers.host}${req.url}`

  proxy.web(req, res, { target, changeOrigin: true }, err => {
    res.writeHead(502)
    res.end('Proxy error: ' + err.message)
  })
}

// Handler CONNECT (tunnel HTTPS)
function connectHandler(req, clientSocket, head) {
  let clientIp = clientSocket.remoteAddress || ''
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7)
  if (clientIp === '::1') clientIp = '127.0.0.1'

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (CONNECT)`)
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    clientSocket.destroy()
    return
  }

  let authHeader = null
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === 'proxy-authorization') {
      authHeader = req.rawHeaders[i + 1]
    }
  }

  if (!isAuthOK(authHeader)) {
    clientSocket.write(
      'HTTP/1.1 407 Proxy Authentication Required\r\n' +
      'Proxy-Authenticate: Basic\r\n\r\n'
    )
    clientSocket.destroy()
    return
  }

  startTunnel(req, clientSocket, head)
}

// Tunnel pour CONNECT
function startTunnel(req, clientSocket, firstChunk) {
  const [host, port] = req.url.split(':')
  const serverSocket = net.connect(port || 443, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (firstChunk && firstChunk.length) serverSocket.write(firstChunk)
    serverSocket.pipe(clientSocket)
    clientSocket.pipe(serverSocket)
  })

  serverSocket.on('error', err => {
    console.log('[TUNNEL ERROR]', err)
    clientSocket.end()
  })

  clientSocket.on('error', err => {
    console.log('[CLIENT ERROR]', err)
    serverSocket.end()
  })
}

// Serveur HTTP proxy
const httpProxyServer = http.createServer(requestHandler)
httpProxyServer.on('connect', connectHandler)
httpProxyServer.listen(HTTP_PROXY_PORT, () => {
  console.log(`HTTP proxy running on port ${HTTP_PROXY_PORT}`)
})

// Serveur HTTPS proxy (si cert dispos)
if (fs.existsSync(CERT_KEY) && fs.existsSync(CERT_CRT)) {
  if (HTTP_PROXY_PORT !== HTTPS_PROXY_PORT) {
    const httpsProxyServer = https.createServer(
      { key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT_CRT) },
      requestHandler
    )
    httpsProxyServer.on('connect', connectHandler)
    httpsProxyServer.listen(HTTPS_PROXY_PORT, () => {
      console.log(`HTTPS proxy running on port ${HTTPS_PROXY_PORT}`)
    })
  }
} else {
  console.warn('No HTTPS certificate found: HTTPS proxy will not be started.')
}
