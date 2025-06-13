const express = require("express");
const { Server } = require("ws");
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
const port = 3000;

app.use(express.static("public"));
app.use(express.json());

const server = app.listen(port, () => {
  console.log("Serveur lancé sur le port", port);
});

const wss = new Server({ server });

// ROUTES HTML
app.get("/ssh", (req, res) => res.sendFile(__dirname + "/public/ssh.html"));
app.get("/ftp", (req, res) => res.sendFile(__dirname + "/public/ftp.html"));
app.get("/sftp", (req, res) => res.sendFile(__dirname + "/public/sftp.html"));
app.get("/telnet", (req, res) => res.sendFile(__dirname + "/public/telnet.html"));

// Import des routes segmentées
require("./routes/ftp")(app, ftp, path, os, fs, Readable, upload);
require("./routes/sftp")(app, SFTPClient, path, Readable, upload);
require("./routes/ssh")(wss, Client, net);
