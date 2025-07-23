const fs = require('fs')
const https = require('https')
const { Server: WSServer } = require('ws')
const { isAllowed } = require('../utils/ipfilter')

const WS_PROXY_PORT = process.env.WS_PROXY_PORT || 9443
const WS_PROXY_USER = process.env.WS_PROXY_USER || 'user'
const WS_PROXY_PASS = process.env.WS_PROXY_PASS || 'pass'
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean)

if (!ALLOWED_IPS.length) {
  console.warn('ALLOWED_IPS vide : aucun accès ne sera autorisé !')
}

const options = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem')
}

const server = https.createServer(options)
const wss = new WSServer({ server })

wss.on('connection', (ws, req) => {
  let clientIp = req.socket.remoteAddress || ''
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7)
  if (clientIp === '::1') clientIp = '127.0.0.1'

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (WSS)`)
    ws.close()
    return
  }

  ws.once('message', msg => {
    const [user, pass] = msg.toString().split(':')
    if (user === WS_PROXY_USER && pass === WS_PROXY_PASS) {
      ws.send('AUTH OK')
      ws.on('message', data => {
        ws.send('ECHO: ' + data)
      })
    } else {
      ws.send('AUTH FAIL')
      ws.close()
    }
  })
})

server.listen(WS_PROXY_PORT, () => {
  console.log(`WSS proxy running on port ${WS_PROXY_PORT}`)
})
