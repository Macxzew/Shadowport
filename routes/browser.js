const axios = require("axios");
const cheerio = require("cheerio");
const BIN_TYPES = [
    "application/zip","application/x-7z-compressed","application/x-rar-compressed",
    "application/x-tar","application/gzip","application/x-bzip2","application/octet-stream",
    "application/x-iso9660-image","application/x-msdownload",
    "application/x-dosexec","application/vnd.android.package-archive"
];
const BIN_EXTS = [
    ".zip",".7z",".rar",".tar",".gz",".bz2",".iso",".exe",".apk",".xz",
    ".doc",".docx",".ppt",".pptx",".xls",".xlsx",".ods",".odt",".odp",".odc",
    ".pdf",".mp4",".avi",".mov",".mkv",".flv",".mpg",".mpeg",".wav",".aac",".ogg",".wma"
];
const HTML_EXTS = [".html",".htm",".php",".asp",".aspx",".jsp"];

function isBinaryArchive(contentType, url) {
    if (contentType && BIN_TYPES.some(type => contentType.startsWith(type))) return true;
    const u = url.toLowerCase();
    return BIN_EXTS.some(ext => u.endsWith(ext));
}
function isValidHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
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
function isBareDomain(url) {
    try {
        const u = new URL(url);
        return (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
    } catch {
        return false;
    }
}
function isFolder(url) {
    try {
        const u = new URL(url);
        if (isBareDomain(url)) return false;
        return u.pathname.endsWith("/") || !/\.[a-z0-9]{2,5}$/i.test(u.pathname.split('/').pop());
    } catch {
        return false;
    }
}
function getLabel(url) {
    try {
        const u = new URL(url);
        if (isBareDomain(url)) return "🌐 " + u.hostname;
        if ((u.pathname === "/" || u.pathname === "") && (u.search || u.hash))
            return "📄 " + u.host + u.search + u.hash;
        if (isFolder(url)) {
            let segs = u.pathname.split("/").filter(Boolean);
            let folder = segs.length ? segs[segs.length - 1] : "folder";
            return "📁 " + folder + "/";
        } else {
            let segs = u.pathname.split("/").filter(Boolean);
            let file = segs.length ? segs[segs.length - 1] : "file";
            return "📄 " + file;
        }
    } catch {
        return "🌐 unknown";
    }
}
function uniqueBy(arr, key) {
    const seen = new Set();
    return arr.filter(x => {
        if (seen.has(x[key])) return false;
        seen.add(x[key]);
        return true;
    });
}

function getCurrentFolderPath(url) {
    try {
        const u = new URL(url);
        let path = u.pathname;
        if (!path.endsWith("/")) path = path.substring(0, path.lastIndexOf("/") + 1);
        if (!path.endsWith("/")) path += "/";
        return path;
    } catch {
        return "/";
    }
}

// Sépare fichiers et sous-dossiers à partir du dossier courant
function splitLinksByFolder(allLinks, currentFolderPath, origin) {
    const files = [];
    const folders = new Map();
    const subfolderFiles = [];
    const otherDomains = [];

    const originDomain = new URL(origin).hostname;  // Récupère le domaine d'origine

    for (const l of allLinks) {
        try {
            const u = new URL(l.href);
            let rel = u.pathname.startsWith(currentFolderPath)
                ? u.pathname.slice(currentFolderPath.length)
                : null;
            if (rel === null) continue;

            if (rel.length > 0 && !rel.includes("/")) {
                files.push(l); // Fichier dans dossier courant
            }
            else if (rel && rel.includes("/")) {
                const folderName = rel.split("/")[0];
                const folderHref = origin + currentFolderPath + folderName + "/";
                if (!folders.has(folderHref)) {
                    folders.set(folderHref, {
                        url: `/browse?url=${encodeURIComponent(folderHref)}`,
                        href: folderHref,
                        display: "📁 " + folderName + "/"
                    });
                }
                // Ajoute dans subfolderFiles si c'est pas un dossier
                if (rel.split("/").length > 1 && !isFolder(l.href)) {
                    subfolderFiles.push(l);
                }
            }

            // Vérifie si le lien appartient à un autre domaine
            if (u.hostname !== originDomain) {
                otherDomains.push({
                    url: `/browse?url=${encodeURIComponent(u.href)}`,
                    href: u.href,
                    display: `🌐 ${u.hostname}`
                });
            }

        } catch (e) {
            console.error("Erreur de traitement du lien:", e);
        }
    }

    return {
        files: uniqueBy(files, "href"),
        folders: Array.from(folders.values()),
        subfolderFiles: uniqueBy(subfolderFiles, "href"),
        otherDomains: uniqueBy(otherDomains, "href")  // Retourne les liens externes
    };
}

function renderAllSections(rootUrl, parentUrl, files, folders, subfolderFiles, otherDomains = []) {
    return `
        <div style="margin-bottom:1.2em;">
            <div style="font-weight:bold;color:#818cf8;margin-bottom:0.3em;">Current folder</div>
            <ul>
                <li>
                    <a href="/browse?url=${encodeURIComponent(rootUrl)}">Root /</a>
                    <span style="color:#888;font-size:0.8em;">(${rootUrl})</span>
                </li>
                ${parentUrl !== rootUrl ? `
                <li>
                    <a href="/browse?url=${encodeURIComponent(parentUrl)}">Parent ..</a>
                    <span style="color:#888;font-size:0.8em;">(${parentUrl})</span>
                </li>` : ""}
                ${folders.map(l => `
                    <li>
                        <a href="${l.url}">${l.display ? l.display : getLabel(l.href)}</a>
                        <span style="color:#888;font-size:0.8em;">(${l.href})</span>
                    </li>
                `).join("")}
                ${files.map(l => `
                    <li>
                        <a href="${l.url}">${l.display ? l.display : getLabel(l.href)}</a>
                        <span style="color:#888;font-size:0.8em;">(${l.href})</span>
                    </li>
                `).join("")}
            </ul>
            ${subfolderFiles.length > 0 ? `
            <div style="font-weight:bold;color:#f59e42;margin:1em 0 0.4em 0;">Other folders/files</div>
            <ul>
                ${subfolderFiles.map(l => `
                    <li>
                        <a href="${l.url}">${l.display ? l.display : getLabel(l.href)}</a>
                        <span style="color:#888;font-size:0.8em;">(${l.href})</span>
                    </li>
                `).join("")}
            </ul>
            ` : ""}
            ${otherDomains.length > 0 ? `
            <div style="font-weight:bold;color:#f59e42;margin:1em 0 0.4em 0;">Other domains</div>
            <ul>
                ${otherDomains.map(l => `
                    <li>
                        <a href="${l.url}">${l.display ? l.display : getLabel(l.href)}</a>
                        <span style="color:#888;font-size:0.8em;">(${l.href})</span>
                    </li>
                `).join("")}
            </ul>
            ` : ""}
        </div>
    `;
}

async function extractLinksFromHtml(url, html) {
    const $ = cheerio.load(html);
    let files = [];
    $("a[href]").each((_, el) => {
        let href = $(el).attr("href");
        if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;
        try {
            let abs = new URL(href, url).href;
            if (abs === url) return;
            files.push({
                url: `/browse?url=${encodeURIComponent(abs)}`,
                href: abs,
                display: getLabel(abs)
            });
        } catch {}
    });
    $("img[src]").each((_, el) => {
        let src = $(el).attr("src");
        try {
            let abs = new URL(src, url).href;
            files.push({
                url: `/browse?url=${encodeURIComponent(abs)}`,
                href: abs,
                display: getLabel(abs)
            });
        } catch {}
    });
    return uniqueBy(files, "href");
}

async function renderPreviewBlockWithInfo(url, contentType, rootUrl, parentUrl, linksList, contentLength) {
    const proxifiedUrl = `/browsefile?url=${encodeURIComponent(url)}`;
    const lowerUrl = url.toLowerCase();

    const currentFolderPath = getCurrentFolderPath(url);
    const {files, folders, subfolderFiles} = splitLinksByFolder(
        linksList,
        currentFolderPath,
        getRootUrl(url).replace(/\/$/, '')
    );

    let filename;
    try {
        filename = decodeURIComponent(new URL(url).pathname.split('/').pop());
    } catch {
        filename = "file";
    }

    function formatBytes(bytes) {
        if (!bytes) return "Taille inconnue";
        const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To'];
        let i = 0;
        let dblByte = parseInt(bytes, 10);
        while (dblByte >= 1024 && i < sizes.length - 1) {
            dblByte /= 1024;
            i++;
        }
        return dblByte.toFixed(2) + ' ' + sizes[i];
    }

    const sizeReadable = formatBytes(contentLength);

    let previewHtml = "";
    if (
        contentType.includes("json") ||
        contentType.startsWith("text/") ||
        contentType.includes("javascript") ||
        contentType.includes("xml") ||
        contentType.includes("html") ||
        contentType.includes("x-www-form-urlencoded") ||
        HTML_EXTS.some(ext => lowerUrl.endsWith(ext))
    ) {
        try {
            const resp = await axios.get(url, {
                responseType: "arraybuffer",
                headers: { "User-Agent": "Mozilla/5.0" },
                timeout: 20000,
                validateStatus: () => true,
                maxContentLength: 102400,
            });
            let buf = Buffer.from(resp.data);
            let txt = buf.toString("utf8").slice(0, 100000);
            let textPreview = txt.replace(/</g, "&lt;");
            if (buf.length === 100000) textPreview += "...";
            previewHtml = `<pre style="background:#181826;border-radius:0.4em;padding:1em;overflow:auto;max-height:55vh;word-break:break-all;margin:2em auto;">${textPreview}</pre>`;
        } catch {
            previewHtml = `<pre style="background:#181826;border-radius:0.4em;padding:1em;margin:2em auto;">[Impossible d'afficher le contenu]</pre>`;
        }
    } else if (contentType.startsWith("image/")) {
        previewHtml = `<img src="${proxifiedUrl}" alt="Image" style="max-width:80vw;max-height:60vh;display:block;margin:2em auto;">`;
    } else if (contentType.includes("pdf")) {
        previewHtml = `<iframe src="${proxifiedUrl}" style="width:99%;height:72vh;border:0;background:#222;display:block;margin:2em auto;"></iframe>`;
    } else if (contentType.includes("audio/mpeg") || lowerUrl.endsWith(".mp3")) {
        previewHtml = `<audio src="${proxifiedUrl}" controls style="width:90%;margin:2em auto;display:block;background:#181826"></audio>`;
    } else if (contentType.includes("video/mp4") || lowerUrl.endsWith(".mp4")) {
        previewHtml = `<video src="${proxifiedUrl}" controls style="max-width:80vw;max-height:60vh;display:block;margin:2em auto;background:#181826"></video>`;
    } else {
        previewHtml = `
            <div style="margin:2em 0; text-align:center; font-weight:bold; font-family: monospace;">
                <p>Fichier: ${filename}</p>
                <p>Taille: ${sizeReadable}</p>
            </div>
        `;
    }

    return `
        <div style="font-family:monospace;padding:1em;">
            <div class="listing-title"><b>Link explorer:</b> ${url}</div>
            ${renderAllSections(rootUrl, parentUrl, files, folders, subfolderFiles)}
            <div style="margin-bottom:2em;">
                <div style="font-weight:bold;color:#818cf8;margin-bottom:0.3em;">File preview</div>
                ${previewHtml}
            </div>
            <div id="navActions" style="display:flex;gap:1em;justify-content:left;margin:2em 0 0 0">
                <a href="/browsedownload?url=${encodeURIComponent(url)}"
                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded transition"
                style="text-decoration:none;font-size:1.1em;">
                    ⬇️ Download
                </a>
                <a href="${url}" target="_blank" rel="noopener"
                class="bg-indigo-700 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded transition"
                style="text-decoration:none;">
                    🌐 Open in new tab
                </a>
                <a href="/browser"
                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded transition"
                style="text-decoration:none;">
                    ⌂ Home
                </a>
            </div>
        </div>
    `;
}

function isExplicitFile(url) {
    try {
        const pathname = new URL(url).pathname;
        return /\.[a-z0-9]{2,5}$/i.test(pathname.split('/').pop());
    } catch { return false; }
}

module.exports = function(app) {
    app.get('/browsefile', async (req, res) => {
        const url = req.query.url;
        if (!url || !isValidHttpUrl(url))
            return res.status(400).send("Invalid url");
        try {
            const fileRes = await axios.get(url, {
                responseType: "stream",
                headers: { "User-Agent": "Mozilla/5.0" },
                timeout: 20000,
                validateStatus: () => true
            });
            res.setHeader("Content-Type", fileRes.headers["content-type"] || "application/octet-stream");
            fileRes.data.pipe(res);
        } catch (e) {
            res.status(502).send("Proxy error");
        }
    });
    app.get('/browsedownload', async (req, res) => {
        const url = req.query.url;
        if (!url || !isValidHttpUrl(url))
            return res.status(400).send("Invalid url");
        try {
            const urlObj = new URL(url);
            let filename = decodeURIComponent(urlObj.pathname.split('/').pop() || "file");
            if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename += ".bin";
            const fileRes = await axios.get(url, {
                responseType: "stream",
                headers: { "User-Agent": "Mozilla/5.0" },
                timeout: 20000,
                validateStatus: () => true
            });
            res.setHeader("Content-Type", fileRes.headers["content-type"] || "application/octet-stream");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            fileRes.data.pipe(res);
        } catch (e) {
            res.status(502).send("Proxy error");
        }
    });
    app.get("/browse", async (req, res) => {
        const url = req.query.url;
        if (!url || !isValidHttpUrl(url))
            return res.status(400).send("Missing or invalid url");
        const rootUrl = getRootUrl(url);
        const parentUrl = getParentUrl(url);

        let headers;
        try {
            const headResp = await axios.head(url, {
                headers: { "User-Agent": "Mozilla/5.0" },
                timeout: 8000,
                validateStatus: () => true
            });
            headers = headResp.headers;
        } catch (e) {
            return res.status(500).send("Erreur lors de la récupération des headers: " + e.message);
        }
        const contentType = headers["content-type"] || "";
        const contentLength = headers["content-length"] || null;
        const isFile = isExplicitFile(url);

        if (!isFile) {
            // Cas dossier
            let isApacheDir = false;
            let html = "";
            try {
                const getResp = await axios.get(url, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                    timeout: 20000,
                    validateStatus: () => true
                });
                html = getResp.data.toString("utf8");
                if (
                    getResp.headers["content-type"] && getResp.headers["content-type"].includes("text/html") &&
                    (/index of /i.test(html) || /parent directory/i.test(html))
                ) isApacheDir = true;
            } catch {}

            let allLinks = [];
            if (isApacheDir && html) {
                allLinks = await extractLinksFromHtml(url, html);
            }
            for (const file of ["index.php", "index.html"]) {
                const idxUrl = url.endsWith("/") ? url + file : url + "/" + file;
                try {
                    const resp = await axios.head(idxUrl, {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 5000,
                        validateStatus: s => true
                    });
                    if (String(resp.status).startsWith("2")) {
                        allLinks.push({
                            url: `/browse?url=${encodeURIComponent(idxUrl)}`,
                            href: idxUrl,
                            display: getLabel(idxUrl)
                        });
                        try {
                            const idxResp = await axios.get(idxUrl, {
                                headers: { "User-Agent": "Mozilla/5.0" },
                                timeout: 15000,
                                validateStatus: () => true
                            });
                            const idxHtml = idxResp.data.toString("utf8");
                            const idxLinks = await extractLinksFromHtml(idxUrl, idxHtml);
                            allLinks = allLinks.concat(idxLinks);
                        } catch {}
                    }
                } catch {}
            }
            allLinks = uniqueBy(allLinks, "href");

            const currentFolderPath = getCurrentFolderPath(url);
            const {files, folders, subfolderFiles} = splitLinksByFolder(
                allLinks,
                currentFolderPath,
                getRootUrl(url).replace(/\/$/, '')
            );

            // Défini previewHtml vide car pas de preview pour dossier
            const previewHtml = "";

            res.send(`
                <div style="font-family:monospace;padding:1em;">
                    <div class="listing-title"><b>Link explorer:</b> ${url}</div>
                    ${renderAllSections(rootUrl, parentUrl, files, folders, subfolderFiles)}
                    ${previewHtml}
                    <div id="navActions" style="display:flex;gap:1em;justify-content:left;margin:2em 0 0 0">
                        <a href="/browsedownload?url=${encodeURIComponent(url)}"
                        class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded transition"
                        style="text-decoration:none;font-size:1.1em;">
                            ⬇️ Download
                        </a>
                        <a href="/browser"
                        class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded transition"
                        style="text-decoration:none;">
                            ⌂ Home
                        </a>
                    </div>
                </div>
            `);
            return;
        }

        // Cas fichier explicitement demandé
        try {
            let linksList = [];
            if (contentType.includes("html") || HTML_EXTS.some(ext => url.toLowerCase().endsWith(ext))) {
                try {
                    const htmlResp = await axios.get(url, {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 20000,
                        validateStatus: () => true
                    });
                    const html = htmlResp.data.toString("utf8");
                    linksList = await extractLinksFromHtml(url, html);
                } catch {}
            }

            // Preview pour type fichier (texte, image, binaire...)
            const previewHtml = await renderPreviewBlockWithInfo(url, contentType, rootUrl, parentUrl, linksList, contentLength);
            res.send(previewHtml);

        } catch (e) {
            res.status(500).send("Browse error: " + (e.response?.status || "") + " " + e.message);
        }
    });
};
