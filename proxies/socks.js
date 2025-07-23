const socks = require('socksv5')
const { isAllowed } = require('../utils/ipfilter')

const SOCKS_PORT = process.env.SOCKS_PROXY_PORT || 1080
const SOCKS_USER = process.env.SOCKS_PROXY_USER || 'user'
const SOCKS_PASS = process.env.SOCKS_PROXY_PASS || 'pass'
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean)

if (!ALLOWED_IPS.length) {
  console.warn('ALLOWED_IPS vide : aucun accès ne sera autorisé !')
}

const server = socks.createServer((info, accept, deny) => {
  let clientIp = info.srcAddr || ''
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7)
  if (clientIp === '::1') clientIp = '127.0.0.1'

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (SOCKS)`)
    return deny()
  }
  accept()
})

// Gestion d’erreur explicite sur les requêtes non SOCKS
server.on('error', (err) => {
  // Filtre le message 'Incompatible SOCKS protocol version'
  if (
    err &&
    err.message &&
    err.message.startsWith('Incompatible SOCKS protocol version')
  ) {
    console.warn(`[SOCKS] Requête non SOCKS détectée (souvent un client HTTP sur port SOCKS):`, err.message)
    return // Ne fait rien d’autre, c’est informatif
  }
  // Log toutes les autres erreurs pour debug
  console.error('[SOCKS ERROR]', err)
})

server.useAuth(socks.auth.UserPassword((user, pass, cb) => {
  cb(user === SOCKS_USER && pass === SOCKS_PASS)
}))

server.listen(SOCKS_PORT, '0.0.0.0', () => {
  console.log(`SOCKS4/5 proxy running on port ${SOCKS_PORT}`)
})
