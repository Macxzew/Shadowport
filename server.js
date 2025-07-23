require('dotenv').config(); // ← Charge .env avant tout

const SFTPClient = require("ssh2-sftp-client");
const { Readable } = require("stream");
const { Client } = require("ssh2");
const express = require("express");
const multer = require("multer");
const { Server } = require("ws");
const ftp = require("basic-ftp");
const http = require("http");
const path = require("path");
const net = require("net");
const fs = require("fs");
const os = require("os");

const { ipFilterMiddleware } = require('./utils/ipfilter');

const upload = multer({ storage: multer.memoryStorage() });
const startPort = 8000;
const app = express();

// LANCEMENT DES PROXYS
require('./proxies/http')(app);

app.use(express.static("public"));
app.use(express.json());

// Récupération IPs autorisées depuis .env ou vide
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean);

// Middleware global IP filter
app.use(ipFilterMiddleware(ALLOWED_IPS));

// ROUTES HTML
app.get("/webcheck", (req, res) =>res.sendFile(path.join(__dirname, "public/webcheck.html")));
app.get("/browser", (req, res) =>res.sendFile(path.join(__dirname, "public/browser.html")));
app.get("/telnet", (req, res) =>res.sendFile(path.join(__dirname, "public/telnet.html")));
app.get("/sftp", (req, res) =>res.sendFile(path.join(__dirname, "public/sftp.html")));
app.get("/ssh", (req, res) =>res.sendFile(path.join(__dirname, "public/ssh.html")));
app.get("/ftp", (req, res) =>res.sendFile(path.join(__dirname, "public/ftp.html")));

// ROUTES API
require("./routes/sftp")(app, SFTPClient, path, Readable, upload);
require("./routes/ftp")(app, ftp, path, os, fs, Readable, upload);
require("./routes/webcheck")(app);
require("./routes/browser")(app);

// HANDLERS WS
function initWS(server) {
  const wss = new Server({ server });
  require("./routes/ssh")(wss, Client);
  require("./routes/telnet")(wss, net);
}

// SERVER START
function startServer(port) {
  const server = http.createServer(app);

  server.on("error", err => {
    if (["EADDRINUSE", "EACCES"].includes(err.code)) {
      console.log(`Port ${port} occupé (${err.code}), essai ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Erreur serveur:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Serveur prêt sur le port ${port}`);
    initWS(server);
  });
}

startServer(startPort);
