module.exports = (app, SFTPClient, path, Readable, upload) => {
  async function deleteSftpRecursive(sftp, targetPath) {
    const list = await sftp.list(targetPath);
    for (const item of list) {
      const fullPath = path.posix.join(targetPath, item.name);
      if (item.type === 'd') {
        await deleteSftpRecursive(sftp, fullPath);
      } else {
        await sftp.delete(fullPath);
      }
    }
    await sftp.rmdir(targetPath);
  }

  async function safeEnd(sftp) {
    try {
      if (sftp && sftp.sftp) {
        await sftp.end();
      }
    } catch {
      // ignore errors during close
    }
  }

  app.post("/api/sftp/list", async (req, res) => {
    const { host, port, username, password, path: dirPath } = req.body;
    const sftp = new SFTPClient();
    try {
      await sftp.connect({ host, port, username, password });
      const list = await sftp.list(dirPath || "/");
      const files = list.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type === "d" ? "directory" : "file"
      }));
      res.json({ ok: true, files });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      await safeEnd(sftp);
    }
  });

  app.get("/api/sftp/download", async (req, res) => {
    const { host, port, user, pass, path: filePath } = req.query;
    const sftp = new SFTPClient();
    try {
      const remotePath = "/" + filePath.replace(/^\/+/g, "");
      const tempPath = path.join(require("os").tmpdir(), path.basename(remotePath));
      await sftp.connect({ host, port: parseInt(port), username: user, password: pass });
      await sftp.fastGet(remotePath, tempPath);
      res.download(tempPath, path.basename(remotePath), () => {
        fs.unlink(tempPath, () => {});
      });
    } catch (err) {
      res.status(500).send("Erreur de téléchargement: " + err.message);
    } finally {
      await safeEnd(sftp);
    }
  });

  app.post("/api/sftp/delete", async (req, res) => {
    const { host, port, username, password, path: filePath } = req.body;
    const sftp = new SFTPClient();
    try {
      await sftp.connect({ host, port, username, password });
      let stat;
      try {
        stat = await sftp.stat(filePath);
      } catch (err) {
        return res.status(404).json({ ok: false, error: "Fichier introuvable: " + filePath });
      }
      if (stat.isDirectory) {
        await deleteSftpRecursive(sftp, filePath);
      } else {
        await sftp.delete(filePath);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      await safeEnd(sftp);
    }
  });

  app.post("/api/sftp/upload", upload.single("file"), async (req, res) => {
    const { host, port, username, password, path: remotePath } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ ok: false, error: "Aucun fichier envoyé." });
    }

    const sftp = new SFTPClient();

    try {
      await sftp.connect({ host, port: parseInt(port), username, password });
      await sftp.put(file.buffer, remotePath);
      res.json({ ok: true });
    } catch (err) {
      console.error("Erreur d'upload SFTP:", err);
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      await safeEnd(sftp);
    }
  });
};
