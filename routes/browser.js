// routes/browser.js
const axios = require("axios");
const cheerio = require("cheerio");

module.exports = function(app) {
  // Proxy principal (HTML)
  app.get("/proxy", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("Missing url");
    try {
      // UA desktop pour éviter les redirs mobiles
      const response = await axios.get(url, {
        responseType: "text",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" },
        maxRedirects: 5,
        validateStatus: s => s < 400 // laisse passer 3xx, 2xx
      });
      let html = response.data;
      const $ = cheerio.load(html);

      // Réécriture des liens internes
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
          const abs = new URL(href, url).href;
          $(el).attr("href", `/proxy?url=${encodeURIComponent(abs)}`);
        }
      });
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          const abs = new URL(src, url).href;
          $(el).attr("src", `/proxy-asset?url=${encodeURIComponent(abs)}`);
        }
      });
      $("link[rel='stylesheet'][href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          const abs = new URL(href, url).href;
          $(el).attr("href", `/proxy-asset?url=${encodeURIComponent(abs)}`);
        }
      });
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          const abs = new URL(src, url).href;
          $(el).attr("src", `/proxy-asset?url=${encodeURIComponent(abs)}`);
        }
      });

      // Pour garder le charset
      $("head").prepend(`<base href="${url}">`);
      res.send($.html());
    } catch (e) {
      res.status(500).send("Proxy error: " + e.message);
    }
  });

  // Proxy pour assets (images, CSS, JS, etc)
  app.get("/proxy-asset", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("Missing url");
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      res.set("Content-Type", response.headers["content-type"] || "application/octet-stream");
      res.send(response.data);
    } catch (e) {
      res.status(500).send("Proxy asset error: " + e.message);
    }
  });

  // Proxy pour Download
  app.get("/proxy-download", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("Missing url");
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      res.setHeader("Content-Disposition", "attachment; filename=" + (url.split("/").pop() || "file"));
      res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
      res.send(response.data);
    } catch (e) {
      res.status(500).send("Proxy download error: " + e.message);
    }
  });
};
