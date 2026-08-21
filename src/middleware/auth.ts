import types from 'express'
import jwt from 'jsonwebtoken'
import type { AuthRequest } from '../interfaces/AuthRequest.ts'

export function AuthMiddleware(req: AuthRequest, res: types.Response, next: types.NextFunction) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    const secret = process.env.JWT_SECRET || "";
    const decoded = jwt.verify(token, secret);

    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}