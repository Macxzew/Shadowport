// /server.js
require('dotenv').config();

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

const upload = multer({ storage: multer.memoryStorage() });
const startPort = process.env.PORT ? Number(process.env.PORT) : 8000;
const app = express();

app.use(express.static("public"));
app.use(express.json());

// routes HTML
app.get("/webcheck", (req, res) => res.sendFile(path.join(__dirname, "public/webcheck.html")));
app.get("/browser", (req, res) => res.sendFile(path.join(__dirname, "public/browser.html")));
app.get("/telnet", (req, res) => res.sendFile(path.join(__dirname, "public/telnet.html")));
app.get("/sftp", (req, res) => res.sendFile(path.join(__dirname, "public/sftp.html")));
app.get("/ssh", (req, res) => res.sendFile(path.join(__dirname, "public/ssh.html")));
app.get("/ftp", (req, res) => res.sendFile(path.join(__dirname, "public/ftp.html")));

// Routes pour SFTP, FTP, Webcheck, Browser, etc.
require("./routes/sftp")(app, SFTPClient, path, Readable, upload);
require("./routes/ftp")(app, ftp, path, os, fs, Readable, upload);
require("./routes/webcheck")(app);
require("./routes/browser")(app);

// WebSocket
function initWS(server) {
  const wss = new Server({ server });
  require("./routes/ssh")(wss, Client);
  require("./routes/telnet")(wss, net);
}

function startServer(port) {
  const server = http.createServer(app);

  server.on("error", err => {
    if (["EADDRINUSE", "EACCES"].includes(err.code)) {
      console.log(`Port ${port} is occupied (${err.code}), trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Server is ready on port ${port}`);
    initWS(server);
  });
}

startServer(startPort);
