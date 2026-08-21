import type { Request } from "express";
import type jwt from "jsonwebtoken";
export interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}