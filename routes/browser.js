// routes/browser.js
const axios = require("axios");
const cheerio = require("cheerio");

// Petite fonction de validation d'URL externe (anti SSRF de base)
function isValidHttpUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = function(app) {
  // Proxy principal (HTML)
  app.get("/proxy", async (req, res) => {
    const url = req.query.url;
    if (!url || !isValidHttpUrl(url)) return res.status(400).send("Missing or invalid url");
    try {
      // UA desktop pour éviter les redirs mobiles
      const response = await axios.get(url, {
        responseType: "text",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" },
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: s => s < 400 // laisse passer 3xx, 2xx
      });

      let html = response.data;
      const $ = cheerio.load(html);

      // Réécriture des liens internes pour tout passer par le proxy
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("javascript:") && !href.startsWith("#") && !href.startsWith("mailto:")) {
          try {
            const abs = new URL(href, url).href;
            $(el).attr("href", `/proxy?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          try {
            const abs = new URL(src, url).href;
            $(el).attr("src", `/proxy-asset?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      $("link[rel='stylesheet'][href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          try {
            const abs = new URL(href, url).href;
            $(el).attr("href", `/proxy-asset?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          try {
            const abs = new URL(src, url).href;
            $(el).attr("src", `/proxy-asset?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      // Conserve les bases relatives et charset
      $("head").prepend(`<base href="${url}">`);

      res.send($.html());
    } catch (e) {
      res.status(500).send("Proxy error: " + (e.response?.status || "") + " " + e.message);
    }
  });

  // Proxy pour assets (images, CSS, JS, etc)
  app.get("/proxy-asset", async (req, res) => {
    const url = req.query.url;
    if (!url || !isValidHttpUrl(url)) return res.status(400).send("Missing or invalid url");
    try {
      const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
      res.set("Content-Type", response.headers["content-type"] || "application/octet-stream");
      res.send(response.data);
    } catch (e) {
      res.status(500).send("Proxy asset error: " + (e.response?.status || "") + " " + e.message);
    }
  });

  // Proxy pour Download direct
  app.get("/proxy-download", async (req, res) => {
    const url = req.query.url;
    if (!url || !isValidHttpUrl(url)) return res.status(400).send("Missing or invalid url");
    try {
      const response = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
      const filename = url.split("/").pop() || "file";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
      res.send(response.data);
    } catch (e) {
      res.status(500).send("Proxy download error: " + (e.response?.status || "") + " " + e.message);
    }
  });
};
