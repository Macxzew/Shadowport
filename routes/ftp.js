module.exports = (app, ftp, path, os, fs, Readable, upload) => {
  async function deleteFtpRecursive(client, targetPath) {
    const list = await client.list(targetPath);
    for (const item of list) {
      const fullPath = path.posix.join(targetPath, item.name);
      if (item.isDirectory) {
        await deleteFtpRecursive(client, fullPath);
      } else {
        await client.remove(fullPath);
      }
    }
    await client.removeDir(targetPath);
  }

  app.post("/api/ftp/list", async (req, res) => {
    const { host, port, username, password, secure, path: dirPath } = req.body;
    const client = new ftp.Client();
    try {
      await client.access({ host, port, user: username, password, secure });
      const list = await client.list(dirPath || "/");
      const files = list.map(f => ({
        name: f.name,
        size: f.size,
        type: f.isDirectory ? "directory" : "file",
        isDirectory: f.isDirectory
      }));
      res.json({ ok: true, files });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      client.close();
    }
  });

  app.get("/api/ftp/download", async (req, res) => {
    const { host, port, user, pass, secure, path: filePath } = req.query;
    const client = new ftp.Client();
    try {
      const normalizedPath = "/" + filePath.replace(/^\/+/g, "");
      const tempPath = path.join(os.tmpdir(), path.basename(normalizedPath));
      await client.access({ host, port: parseInt(port), user, password: pass, secure: secure === "true" });
      await client.downloadTo(tempPath, normalizedPath);
      res.download(tempPath, path.basename(normalizedPath), () => {
        fs.unlink(tempPath, () => {});
      });
    } catch (err) {
      res.status(500).send("Erreur de téléchargement: " + err.message);
    } finally {
      client.close();
    }
  });

  app.post("/api/ftp/delete", async (req, res) => {
    const { host, port, username, password, secure, path: filePath } = req.body;
    const client = new ftp.Client();
    try {
      await client.access({ host, port, user: username, password, secure });
      const list = await client.list(path.posix.dirname(filePath));
      const target = list.find(f => f.name === path.posix.basename(filePath));
      if (target?.isDirectory) {
        await deleteFtpRecursive(client, filePath);
      } else {
        await client.remove(filePath);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      client.close();
    }
  });

  app.post("/api/ftp/upload", upload.single("file"), async (req, res) => {
    const { host, port, username, password, secure, path: remotePath } = req.body;
    const file = req.file;

    if (!file || !remotePath) {
      return res.status(400).json({ ok: false, error: "Fichier ou chemin manquant." });
    }

    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host,
        port: parseInt(port),
        user: username,
        password,
        secure: secure === "true" || secure === true
      });

      const remoteDir = path.posix.dirname(remotePath).replace(/\\/g, "/");
      await client.ensureDir(remoteDir);

      const stream = Readable.from(file.buffer);
      await client.uploadFrom(stream, remotePath);

      res.json({ ok: true });
    } catch (err) {
      console.error("Erreur d'upload FTP:", err);
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      client.close();
    }
  });
};
