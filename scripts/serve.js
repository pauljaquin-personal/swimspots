import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { handleRequest } from "../src/worker.js";
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
      const request = new Request(`http://127.0.0.1:4173${req.url}`, {
        method: req.method,
      });
      const response = await handleRequest(
        request,
        { ASSETS: assets, OPEN_METEO_API_KEY: process.env.OPEN_METEO_API_KEY },
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
