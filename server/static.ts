import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectPodcastMeta } from "./podcastMeta";
import { injectPixels } from "./pixelInjector";

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

  app.use(express.static(distPath, { index: false }));

  app.use("/{*path}", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;

    try {
      let html = fs.readFileSync(indexPath, "utf-8");
      html = await injectPodcastMeta(html, url);
      html = await injectPixels(html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      console.error("[Static] Meta injection error:", err);
      res.sendFile(indexPath);
    }
  });
}
