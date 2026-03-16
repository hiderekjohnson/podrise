import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET or SESSION_SECRET environment variable must be set");
  }
  return secret;
}

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export interface JwtPayload {
  userId: number;
  type: "access";
}

export function generateAccessToken(userId: number): string {
  return jwt.sign({ userId, type: "access" } as JwtPayload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshTokenString(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    if (decoded.type !== "access") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export async function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  if (req.session?.userId) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      const user = await storage.getUserById(payload.userId);
      if (user) {
        (req as any).jwtUserId = payload.userId;
        return next();
      }
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  return res.status(401).json({ message: "Not authenticated" });
}

export function getAuthUserId(req: Request): number | null {
  if (req.session?.userId) return req.session.userId;
  if ((req as any).jwtUserId) return (req as any).jwtUserId;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      (req as any).jwtUserId = payload.userId;
      return payload.userId;
    }
  }

  return null;
}
