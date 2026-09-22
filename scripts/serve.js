import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { handleRequest } from "../src/worker.js";
import { LocalSubmissions } from "./local-submissions.js";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const store = new LocalSubmissions(
  process.env.SUBMISSIONS_FILE || resolve(".local/submissions.json"),
);
const root = resolve("public");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
};
const entries = new Map();
const cache = {
  async match(key) {
    const hit = entries.get(key.url);
    if (hit && Date.now() < hit.expires) return new Response(hit.body);
    return undefined;
  },
  async put(key, response) {
    entries.set(key.url, {
      body: await response.text(),
      expires: Date.now() + 3600000,
    });
  },
};
const assets = {
  async fetch(request) {
    try {
      const path = resolve(
        root,
        "." + decodeURIComponent(new URL(request.url).pathname),
      );
      if (path !== root && !path.startsWith(root + "/"))
        return new Response("Forbidden", { status: 403 });
      const file = path === root ? resolve(root, "index.html") : path;
      return new Response(await readFile(file), {
        headers: {
          "Content-Type": types[extname(file)] || "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
http
  .createServer(async (req, res) => {
    try {
      if (!["127.0.0.1:4173", "localhost:4173"].includes(req.headers.host)) {
        res.writeHead(403).end("Invalid host");
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16000) {
          res.writeHead(413).end("Too large");
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await handleRequest(
        request,
        {
          ASSETS: assets,
          OPEN_METEO_API_KEY: process.env.OPEN_METEO_API_KEY,
          SUBMISSION_STORE: store,
          LOCAL_REVIEW: true,
        },
        null,
        { cache },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end("Server error");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("Swimspots: http://127.0.0.1:4173"),
  );
