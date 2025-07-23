const net = require('net')
const { isAllowed } = require('../utils/ipfilter')

const SOCKS_PORT = process.env.SOCKS_PROXY_PORT ? Number(process.env.SOCKS_PROXY_PORT) : 1080
const SOCKS_USER = process.env.SOCKS_PROXY_USER || 'user'
const SOCKS_PASS = process.env.SOCKS_PROXY_PASS || 'pass'
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean)
if (!ALLOWED_IPS.length) {
  console.warn('ALLOWED_IPS vide : aucun accès ne sera autorisé !')
}

process.on('uncaughtException', (err) => {
  if (err && err.code === 'ECONNRESET') return
  console.error('[SOCKS] Uncaught:', err)
})

const server = net.createServer(socket => {
  let clientIp = socket.remoteAddress || ''
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7)
  if (clientIp === '::1') clientIp = '127.0.0.1'

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (SOCKS)`)
    socket.destroy()
    return
  }

  let stage = 0
  let remote, addr, port
  socket.on('data', buf => {
    try {
      if (stage === 0) {
        // SOCKS5 handshake
        if (buf[0] !== 0x05)
          return socket.end()
        // Auth methods: only USER/PASS (0x02)
        socket.write(Buffer.from([0x05, 0x02]))
        stage = 1
      } else if (stage === 1) {
        // Username/password subnegociation
        if (buf[0] !== 0x01)
          return socket.end()
        const ulen = buf[1]
        const username = buf.slice(2, 2 + ulen).toString()
        const plen = buf[2 + ulen]
        const password = buf.slice(3 + ulen, 3 + ulen + plen).toString()
        if (username !== SOCKS_USER || password !== SOCKS_PASS) {
          socket.write(Buffer.from([0x01, 0x01]))
          return socket.end()
        }
        socket.write(Buffer.from([0x01, 0x00]))
        stage = 2
      } else if (stage === 2) {
        // Only CONNECT supported (0x01)
        if (buf[0] !== 0x05 || buf[1] !== 0x01)
          return socket.end()
        if (buf[3] === 0x01) {
          // IPv4
          addr = buf.slice(4, 8).join('.')
          port = buf.readUInt16BE(8)
        } else if (buf[3] === 0x03) {
          // Domain
          const len = buf[4]
          addr = buf.slice(5, 5 + len).toString()
          port = buf.readUInt16BE(5 + len)
        } else if (buf[3] === 0x04) {
          // IPv6
          const ip6bytes = buf.slice(4, 20)
          let parts = []
          for (let i = 0; i < 8; ++i)
            parts.push(ip6bytes.readUInt16BE(i * 2).toString(16))
          addr = parts.join(':')
          port = buf.readUInt16BE(20)
        } else {
          return socket.end()
        }
        remote = net.connect({ host: addr, port: port }, () => {
          // Reply as per RFC1928
          if (buf[3] === 0x04) {
            const rep = Buffer.alloc(22)
            rep[0] = 0x05
            rep[1] = 0x00
            rep[2] = 0x00
            rep[3] = 0x04
            socket.write(rep)
          } else if (buf[3] === 0x01) {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          } else if (buf[3] === 0x03) {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x03, 0x00, 0, 0]))
          }
          remote.pipe(socket)
          socket.pipe(remote)
        })
        remote.on('error', err => {
          socket.end()
        })
        stage = 3
      }
    } catch (e) {
      console.error('[SOCKS] Exception:', e && e.message)
      socket.end()
    }
  })
  socket.on('error', () => { })
  socket.on('end', () => { if (remote) remote.end() })
})

server.listen(SOCKS_PORT, '::', () => {
  console.log(`SOCKS5 proxy (IPv4/IPv6) running on port ${SOCKS_PORT}`)
})
