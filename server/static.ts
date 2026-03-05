import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectPodcastMeta } from "./podcastMeta";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;

    if (url.startsWith("/podcasts/")) {
      let html = fs.readFileSync(indexPath, "utf-8");
      html = injectPodcastMeta(html, url);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } else {
      res.sendFile(indexPath);
    }
  });
}
