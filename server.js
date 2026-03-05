import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createApiRoutes } from "./src/routes/apiRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
const __filename = fileURLToPath(import.meta.url);
const publicDir = path.join(dirname(__filename), "public");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",");

app.use(
  cors({
    origin: allowedOrigins?.includes("*") ? "*" : allowedOrigins || [],
    methods: ["GET"],
  })
);

// Custom CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    !allowedOrigins ||
    allowedOrigins.includes("*") ||
    !origin ||
    (origin && allowedOrigins.includes(origin))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return next();
  }
  res.status(403).json({ success: false, message: "Forbidden: Origin not allowed" });
});

// ── HLS Proxy ──────────────────────────────────────────────────────────────
const REFERERS = [
  "https://megacloud.tv/",
  "https://megacloud.blog/",
  "https://megacloud.club/",
  "https://aniwatch.to/",
  "https://megaplay.buzz/",
  "https://hianime.to/",
  "https://rainveil36.xyz/",
  "https://rapid-cloud.co/",
  "https://crimsonstorm18.live/",

];

app.get("/api/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "No url provided" });

  const decoded = decodeURIComponent(url);

  let response;
  let usedReferer;

  for (const referer of REFERERS) {
    try {
      response = await fetch(decoded, {
        headers: {
          "Referer": referer,
          "Origin": new URL(referer).origin,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "cross-site",
        },
      });

      if (response.ok) {
        usedReferer = referer;
        break;
      }

      console.log(`Referer ${referer} → ${response.status} for ${decoded}`);
    } catch (err) {
      console.log(`Referer ${referer} threw: ${err.message}`);
    }
  }

  if (!response || !response.ok) {
    console.error(`All referers failed for ${decoded}`);
    return res.status(403).json({ error: "All referers failed" });
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  // Rewrite m3u8 so all segment/playlist URLs also go through this proxy
  if (decoded.includes(".m3u8")) {
    const text = await response.text();
    const baseUrl = decoded.substring(0, decoded.lastIndexOf("/") + 1);

    const rewritten = text.replace(/^(?!#)(\S+)$/gm, (match) => {
      const absolute = match.startsWith("http") ? match : baseUrl + match;
      return `/api/proxy?url=${encodeURIComponent(absolute)}`;
    });

    return res.send(rewritten);
  }

  // Binary segments — pipe directly
  Readable.fromWeb(response.body).pipe(res);
});
// ───────────────────────────────────────────────────────────────────────────

app.use(express.static(publicDir, { redirect: false }));

const jsonResponse = (res, data, status = 200) =>
  res.status(status).json({ success: true, results: data });

const jsonError = (res, message = "Internal server error", status = 500) =>
  res.status(status).json({ success: false, message });

createApiRoutes(app, jsonResponse, jsonError);

app.use((req, res) => {
  const filePath = path.join(publicDir, "404.html");
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(500).send("Error loading 404 page.");
  }
});

app.listen(PORT, () => {
  console.info(`Listening at ${PORT}`);
});
