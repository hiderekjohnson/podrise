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

  const projectPublic = path.resolve(__dirname, "..", "public");
  if (fs.existsSync(projectPublic)) {
    app.use(express.static(projectPublic));
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;

    let html = fs.readFileSync(indexPath, "utf-8");
    const injected = injectPodcastMeta(html, url);
    if (injected !== html) {
      res.status(200).set({ "Content-Type": "text/html" }).end(injected);
    } else {
      res.sendFile(indexPath);
    }
  });
}
