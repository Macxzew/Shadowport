process.on('uncaughtException', (err) => {
  if (
    err &&
    err.message &&
    err.message.startsWith('Incompatible SOCKS protocol version')
  ) {
    console.warn('[SOCKS] Client HTTP ou protocole inconnu détecté sur port SOCKS');
    return;
  }
  console.error('Uncaught:', err);
});

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

// Log les autres erreurs pour debug (hors protocole SOCKS invalide)
server.on('error', (err) => {
  if (
    err &&
    err.message &&
    err.message.startsWith('Incompatible SOCKS protocol version')
  ) {
    // Rien à faire ici, c'est déjà géré globalement
    return;
  }
  console.error('[SOCKS ERROR]', err)
})

server.useAuth(socks.auth.UserPassword((user, pass, cb) => {
  cb(user === SOCKS_USER && pass === SOCKS_PASS)
}))

server.listen(SOCKS_PORT, '0.0.0.0', () => {
  console.log(`SOCKS4/5 proxy running on port ${SOCKS_PORT}`)
})
