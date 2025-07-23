<h1 align="center">Shadowport <img src="https://github.com/Macxzew/Shadowport/blob/main/assets/net.gif" width="30px" /></h1>

<p align="center">
  <a href="https://shadowport.onrender.com/">
    <img alt="Render" src="https://img.shields.io/badge/live%20demo-render-purple?logo=glitch">
  </a>
</p>

> **Shadowport** is a multi-protocol remote administration and web exploration panel built with **Node.js**. Manage servers (SSH, Telnet, SFTP/FTP), browse and preview remote files over HTTP/HTTPS, and scan websites for headers, DNS, SSL, security, and SEO. Everything is accessible from a modern, real-time web interface.

<img alt="Shadowport UI" src="/assets/ui.png" width="1000"/>

---

## ⚙️ Features

- 🔐 SSH live terminal (via WebSocket)
- 📡 Telnet live terminal (TCP relay)
- 📂 SFTP & FTP file management (upload, download, delete, recursive delete, folder navigation)
- 🕸️ Web file browser (explore, preview & download remote HTTP/HTTPS files and folders)
- 🌐 WebCheck (scan and analyze website metadata, headers, DNS, SSL, security & SEO)
- 📊 Real-time scan cards with expandable content
- ⚡ Lightweight and responsive interface
- 🛡️ Multiple integrated proxies: HTTP, HTTPS, WSS, and SOCKS4/5
- 🎨 Built with TailwindCSS

---

## 🚀 Installation

Clone the project and run:

```bash
git clone https://github.com/Macxzew/shadowport.git
cd shadowport
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
npm install
node server.js
```
