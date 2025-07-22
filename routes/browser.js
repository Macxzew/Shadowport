const axios = require("axios");
const cheerio = require("cheerio");

function isValidHttpUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isProbablyHtml(contentType) {
  if (!contentType) return false;
  return contentType.includes("text/html");
}

function getRootUrl(currentUrl) {
  try {
    const u = new URL(currentUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return currentUrl;
  }
}

function getParentUrl(currentUrl) {
  try {
    const u = new URL(currentUrl);
    let parent = u.pathname;
    if (parent.endsWith("/")) parent = parent.slice(0, -1);
    parent = parent.substring(0, parent.lastIndexOf("/") + 1);
    if (!parent || parent === "/") return getRootUrl(currentUrl);
    return `${u.protocol}//${u.host}${parent}`;
  } catch {
    return currentUrl;
  }
}

function getDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.split('.').slice(-2).join('.');
  } catch {
    return "";
  }
}

function getHost(urlStr) {
  try {
    return new URL(urlStr).host;
  } catch {
    return "";
  }
}

module.exports = function(app) {
  app.get("/explore", async (req, res) => {
    const url = req.query.url;
    if (!url || !isValidHttpUrl(url)) {
      return res.status(400).send("Missing or invalid url");
    }
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 20000,
        validateStatus: () => true
      });

      const contentType = response.headers["content-type"] || "";

      // Fichier non HTML (preview ou download direct selon ton besoin)
      if (!isProbablyHtml(contentType)) {
        // --- Gestion du nom de fichier ---
        const fileUrl = new URL(url);
        let filename = fileUrl.pathname.split('/').pop() || "file";
        // Ajoute une extension par défaut si absente (évite .html .jpg etc déjà présents)
        if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename += ".bin";

        let disposition = "inline";
        if (
          !contentType.startsWith("image/") &&
          !contentType.includes("pdf") &&
          !contentType.includes("text/") &&
          !contentType.includes("json") &&
          !contentType.includes("javascript")
        ) {
          disposition = "attachment";
        }
        res.set("Content-Type", contentType);
        res.set("Content-Disposition", `${disposition}; filename="${filename}"`);
        res.send(response.data);
        return;
      }

      // HTML (listing liens)
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);
      const links = [];

      const rootUrl = getRootUrl(url);
      const parentUrl = getParentUrl(url);
      const urlObj = new URL(url);
      const currentFolder = url.endsWith("/") ? url : url.substring(0, url.lastIndexOf("/") + 1);

      // Pour éviter les doublons
      const hrefSet = new Set();

      // Lien /
      hrefSet.add(rootUrl);
      links.push({
        text: "/",
        url: `/explore?url=${encodeURIComponent(rootUrl)}`,
        href: rootUrl,
        isSpecial: true,
        priority: 0
      });

      // Lien ..
      if (parentUrl !== rootUrl && !hrefSet.has(parentUrl)) {
        hrefSet.add(parentUrl);
        links.push({
          text: "..",
          url: `/explore?url=${encodeURIComponent(parentUrl)}`,
          href: parentUrl,
          isSpecial: true,
          priority: 1
        });
      }

      // Liens trouvés dans la page (et surtout PAS le lien courant)
      $("a[href]").each((_, el) => {
        let href = $(el).attr("href");
        let text = $(el).text().trim() || href;
        if (
            href &&
            !href.startsWith("javascript:") &&
            !href.startsWith("mailto:") &&
            !href.startsWith("#") &&
            !/\?C=|;O=|;C=|;N=/.test(href)
        ) {
          try {
            const abs = new URL(href, url).href;
            if (abs === url) return;          // <-- N'affiche pas le lien où on est déjà
            if (hrefSet.has(abs)) return;     // déjà vu
            hrefSet.add(abs);

            let priority = 4; // par défaut

            if (abs.startsWith(url)) {
              priority = 2; // enfant du dossier courant
            } else if (abs.startsWith(currentFolder)) {
              priority = 2;
            } else if (abs.startsWith(parentUrl)) {
              priority = 3; // autre fichier dans le dossier parent
            }

            // Même domaine
            if (getDomain(abs) === getDomain(url)) {
              if (getHost(abs) === urlObj.host) {
                // On laisse le priority tel quel
              } else {
                priority = Math.max(priority, 5);
              }
            } else {
              priority = 6; // Autre domaine
            }

            links.push({
              text,
              url: `/explore?url=${encodeURIComponent(abs)}`,
              href: abs,
              priority
            });
          } catch {}
        }
      });

      // Trie par priorité
      links.sort((a, b) => a.priority - b.priority || a.href.localeCompare(b.href));

      // Génère le HTML
      res.send(`
        <div style="font-family:monospace;padding:1em;">
          <div class="listing-title"><b>Explorateur de liens :</b> ${url}</div>
          <ul>
            ${links.map(l =>
              `<li${l.isSpecial ? ' style="font-weight:bold;"' : ""}>
                <a href="${l.url}">${l.text}</a>
                <span style="color:#888;font-size:0.8em;">(${l.href})</span>
              </li>`).join("\n")
            }
          </ul>
          <div id="navActions" style="margin-top:2em;"></div>
        </div>
      `);

    } catch (e) {
      res.status(500).send("Erreur explorer: " + (e.response?.status || "") + " " + e.message);
    }
  });
};
