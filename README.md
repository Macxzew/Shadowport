<h1 align="center">Shadowport <img src="https://github.com/Macxzew/Shadowport/blob/main/assets/net.gif" width="30px" /></h1>

<p align="center">
  <a href="https://shadowport.glitch.me/">
    <img alt="Glitch" src="https://img.shields.io/badge/live%20demo-glitch-purple?logo=glitch">
  </a>
</p>

> **Shadowport** is a multi-protocol remote administration panel (SSH, FTP, SFTP, Telnet, WebCheck) developed in **Node.js**.  
> It allows system administrators to interact with remote machines and scan websites through a sleek, real-time web interface.

<img alt="Shadowport UI" src="https://raw.githubusercontent.com/Macxzew/shadowport/main/assets/ui.png" width="1000"/>

---

## ⚙️ Features

- 🔐 **SSH** live terminal (via WebSocket)
- 📂 **SFTP & FTP** file management (upload, delete, download)
- 📡 **Telnet** interface via TCP relay
- 🌐 **WebCheck** to scan and analyze website metadata, headers, DNS, SSL and more
- 📊 Real-time scan cards with expandable content
- ⚡ Lightweight and responsive interface
- 🎨 Built with TailwindCSS

---

## 🚀 Installation

Clone the project and run:

```bash
git clone https://github.com/Macxzew/shadowport.git
cd shadowport
npm install
node server.js
