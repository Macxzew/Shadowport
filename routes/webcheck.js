const axios = require("axios");
const cheerio = require("cheerio");
const dns = require("dns").promises;
const tls = require("tls");

module.exports = (app) => {
  app.get("/scan", async (req, res) => {
    const target = req.query.url;
    if (!target) return res.status(400).json({ error: "Missing ?url=" });

    const result = {};
    try {
      const url = new URL(target);
      const hostname = url.hostname;

      try {
        const dnsResult = await dns.lookup(hostname);
        result.dns = dnsResult;
        result.ip = dnsResult.address;
      } catch (e) {
        result.dns = { error: e.message };
      }

      try {
        const txt = await dns.resolveTxt(hostname);
        result.txtRecords = txt.flat();
      } catch (e) {
        result.txtRecords = { error: e.message };
      }

      let response;
      try {
        const start = Date.now();
        response = await axios.get(target, { maxRedirects: 5 });
        result.responseTimeMs = Date.now() - start;
        result.status = response.status;
        result.finalUrl = response.request.res.responseUrl;
        result.headers = response.headers;
        result.httpVersion = response.request.res.httpVersion;
        result.webServer = response.headers["server"] || "Unknown";
        result.cookies = response.headers["set-cookie"] || [];

        result.securityHeaders = {
          "strict-transport-security": response.headers["strict-transport-security"] || null,
          "x-content-type-options": response.headers["x-content-type-options"] || null,
          "x-frame-options": response.headers["x-frame-options"] || null,
          "x-xss-protection": response.headers["x-xss-protection"] || null,
          "content-security-policy": response.headers["content-security-policy"] || null,
          "referrer-policy": response.headers["referrer-policy"] || null,
          "permissions-policy": response.headers["permissions-policy"] || null,
          "expect-ct": response.headers["expect-ct"] || null,
          "cross-origin-opener-policy": response.headers["cross-origin-opener-policy"] || null,
          "cross-origin-embedder-policy": response.headers["cross-origin-embedder-policy"] || null,
          "cross-origin-resource-policy": response.headers["cross-origin-resource-policy"] || null,
          "content-security-policy-report-only": response.headers["content-security-policy-report-only"] || null,
          "report-to": response.headers["report-to"] || null,
          "alt-svc": response.headers["alt-svc"] || null
        };

        result.techHeaders = {
          "x-powered-by": response.headers["x-powered-by"] || null,
          "via": response.headers["via"] || null,
          "x-aspnet-version": response.headers["x-aspnet-version"] || null
        };

        const $ = cheerio.load(response.data);
        result.title = $("title").text() || null;
        result.generator = $('meta[name="generator"]').attr("content") || null;

        result.cmsDetection = {
          isWordPress: false,
          evidence: []
        };
        if (result.generator?.toLowerCase().includes("wordpress")) {
          result.cmsDetection.isWordPress = true;
          result.cmsDetection.evidence.push("Meta generator tag");
        }
        if (response.data.includes("/wp-content/") || response.data.includes("/wp-includes/")) {
          result.cmsDetection.isWordPress = true;
          result.cmsDetection.evidence.push("Found wp-content or wp-includes in HTML");
        }
        if (Object.keys(response.headers).some(h => h.includes("x-wp"))) {
          result.cmsDetection.isWordPress = true;
          result.cmsDetection.evidence.push("Header contains x-wp-*");
        }

        result.socialTags = {
          "og:title": $('meta[property="og:title"]').attr("content") || null,
          "og:description": $('meta[property="og:description"]').attr("content") || null,
          "twitter:card": $('meta[name="twitter:card"]').attr("content") || null
        };

        result.domStats = {
          scriptCount: $("script").length,
          imgCount: $("img").length,
          iframeCount: $("iframe").length
        };

        result.charset = $('meta[charset]').attr("charset") || $('meta[http-equiv="Content-Type"]').attr("content") || null;
        result.language = $('html').attr("lang") || null;

        const faviconHref = $('link[rel="icon"]').attr("href") || $('link[rel="shortcut icon"]').attr("href");
        result.favicon = faviconHref ? new URL(faviconHref, url.origin).href : null;

        const links = [];
        $("a").each((_, el) => {
          const href = $(el).attr("href");
          if (href && !href.startsWith("#")) links.push(href);
        });
        result.links = {
          internal: links.filter(l => l.startsWith("/") || l.includes(hostname)),
          external: links.filter(l => !l.includes(hostname)),
          all: [...new Set(links)]
        };

        result.javascriptLibs = [];
        $("script[src]").each((_, el) => {
          const src = $(el).attr("src");
          if (src?.includes("jquery")) result.javascriptLibs.push("jQuery");
          if (src?.includes("react")) result.javascriptLibs.push("React");
          if (src?.includes("vue")) result.javascriptLibs.push("Vue.js");
          if (src?.includes("angular")) result.javascriptLibs.push("Angular");
        });

        result.frontendFrameworks = {
          usesAngular: response.data.includes("ng-"),
          usesVue: response.data.includes("v-"),
          usesReact: response.data.includes("data-reactroot")
        };

        try {
          const manifest = await axios.get(`${url.origin}/manifest.json`);
          result.manifest = manifest.data;
        } catch {
          result.manifest = "Not found";
        }

        result.seoMeta = {
          robots: $('meta[name="robots"]').attr("content") || null,
          canonical: $('link[rel="canonical"]').attr("href") || null
        };

        let score = 10;
        if (!response.headers["content-security-policy"]) score -= 2;
        if (!response.headers["x-frame-options"]) score -= 1;
        if (!response.headers["x-content-type-options"]) score -= 1;
        if (!response.headers["strict-transport-security"]) score -= 1;
        if (response.headers["x-powered-by"]?.toLowerCase().includes("php/5")) score -= 2;
        result.securityScore = Math.max(0, score);

      } catch (e) {
        result.http = { error: e.message };
      }

      result.exposedPaths = {};
      const sensitiveFiles = ["/.env", "/.git", "/config.php", "/admin", "/.htaccess", "/composer.json", "/phpinfo.php"];
      for (const path of sensitiveFiles) {
        try {
          const r = await axios.get(`${url.origin}${path}`);
          result.exposedPaths[path] = `⚠️ HTTP ${r.status}`;
        } catch {
          result.exposedPaths[path] = "❌ Not found";
        }
      }

      for (const [key, path] of Object.entries({
        robots: "/robots.txt",
        sitemap: "/sitemap.xml",
        securityTxt: "/.well-known/security.txt"
      })) {
        try {
          const r = await axios.get(`${url.origin}${path}`);
          result[key] = r.data;
        } catch {
          result[key] = "Not found";
        }
      }

      if (result.ip) {
        try {
          const ipInfo = await axios.get(`http://ip-api.com/json/${result.ip}`);
          result.ipInfo = ipInfo.data;
        } catch {
          result.ipInfo = { error: "IP info unavailable" };
        }
      }

      const getSSL = () => new Promise((resolve) => {
        const socket = tls.connect(443, hostname, { servername: hostname }, () => {
          const cert = socket.getPeerCertificate();
          resolve({
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to
          });
          socket.end();
        });
        socket.on("error", () => resolve({ error: "SSL not available" }));
      });
      result.ssl = await getSSL();

      try {
        const labs = await axios.get(`https://api.ssllabs.com/api/v3/analyze?host=${hostname}&publish=off`);
        result.sslLabs = labs.data;
      } catch {
        result.sslLabs = "Unavailable";
      }

      try {
        const scan = await axios.post("https://urlscan.io/api/v1/scan/", {
          url: target,
          public: "on"
        }, { headers: { "Content-Type": "application/json" } });

        if (scan?.data?.uuid) {
          await new Promise(r => setTimeout(r, 3000));
          const uuid = scan.data.uuid;
          const scanResult = await axios.get(`https://urlscan.io/api/v1/result/${uuid}`);
          result.urlScan = {
            page: scanResult.data.page,
            verdicts: scanResult.data.verdicts
          };
        }
      } catch {
        result.urlScan = "Unavailable";
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
