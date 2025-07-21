const express = require("express");
const { Server } = require("ws");
const http = require("http"); // Nécessaire !
const { Client } = require("ssh2");
const ftp = require("basic-ftp");
const SFTPClient = require("ssh2-sftp-client");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const multer = require("multer");
const { Readable } = require("stream");

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const startPort = 8000;

app.use(express.static("public"));
app.use(express.json());

// ROUTES HTML
app.get("/ssh", (req, res) => res.sendFile(__dirname + "/public/ssh.html"));
app.get("/ftp", (req, res) => res.sendFile(__dirname + "/public/ftp.html"));
app.get("/sftp", (req, res) => res.sendFile(__dirname + "/public/sftp.html"));
app.get("/telnet", (req, res) => res.sendFile(__dirname + "/public/telnet.html"));
app.get("/browser", (req, res) => res.sendFile(__dirname + "/public/browser.html"));
app.get("/webcheck", (req, res) => res.sendFile(__dirname + "/public/webcheck.html"));

// Import des routes segmentées
require("./routes/ftp")(app, ftp, path, os, fs, Readable, upload);
require("./routes/sftp")(app, SFTPClient, path, Readable, upload);
require("./routes/webcheck")(app);
require("./routes/browser")(app);

function tryListen(port) {
  const server = http.createServer(app);
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" || err.code === "EACCES") {
      console.log(`⚠️ Port ${port} indisponible (${err.code}), essai sur ${port + 1}...`);
      tryListen(port + 1);
    } else {
      console.error("Erreur serveur:", err);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    console.log(`✅ Serveur lancé sur le port ${port}`);
    const wss = new Server({ server });
    require("./routes/ssh")(wss, Client);
    require("./routes/telnet")(wss, net);
  });
}

tryListen(startPort);
