const { isAllowed } = require('../utils/ipfilter');
const httpProxy = require('http-proxy');
const url = require('url');

const HTTP_PROXY_USER = process.env.HTTP_PROXY_USER || 'user';
const HTTP_PROXY_PASS = process.env.HTTP_PROXY_PASS || 'pass';
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

if (!ALLOWED_IPS.length) {
  console.warn('ALLOWED_IPS vide : aucun accès ne sera autorisé !');
}

const proxy = httpProxy.createProxyServer({ changeOrigin: true });

// Authentification HTTP Basic
function authOK(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return false;
  const [user, pass] = Buffer.from(header.split(' ')[1], 'base64').toString().split(':');
  return user === HTTP_PROXY_USER && pass === HTTP_PROXY_PASS;
}

function proxyMiddleware(req, res) {
  let clientIp = req.socket.remoteAddress || '';
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7);
  if (clientIp === '::1') clientIp = '127.0.0.1';

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    console.warn(`[REFUS IP] ${clientIp} bloquée (PROXY)`);
    res.writeHead(403);
    return res.end('Forbidden: IP not allowed');
  }

  if (!authOK(req)) {
    res.writeHead(407, { 'Proxy-Authenticate': 'Basic' });
    return res.end('Proxy Authentication required');
  }

  let target;
  if (req.method === 'GET') {
    target = url.parse(req.url, true).query.url;
  } else if (req.method === 'POST') {
    // Lire body JSON pour extraire target
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.url && /^https?:\/\//.test(parsed.url)) {
          doProxy(parsed.url);
        } else {
          res.writeHead(400);
          res.end('Usage: /proxy?url=http(s)://... ou POST {url: "..."}');
        }
      } catch {
        res.writeHead(400);
        res.end('Body JSON invalide');
      }
    });
    return;
  } else {
    res.writeHead(405);
    return res.end('Method Not Allowed');
  }

  if (!target || !/^https?:\/\//.test(target)) {
    res.writeHead(400);
    return res.end('Usage: /proxy?url=http(s)://...');
  }

  doProxy(target);

  function doProxy(targetUrl) {
    proxy.web(req, res, { target: targetUrl }, err => {
      res.writeHead(502);
      res.end('Proxy error: ' + err.message);
    });
  }
}

module.exports = (app) => {
  app.get('/proxy', proxyMiddleware);
  app.post('/proxy', proxyMiddleware);
};
