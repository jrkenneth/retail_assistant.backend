import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "./jwt.js";
import { isBlacklisted } from "./tokenBlacklist.js";

function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.header("Authorization"));
  if (!token) {
    res.status(401).json({ error: "missing_or_invalid_token" });
    return;
  }

  try {
    const claims = verifyAuthToken(token);
    if (isBlacklisted(claims.jti)) {
      res.status(401).json({ error: "Token has been revoked." });
      return;
    }

    req.auth = claims;
    req.user = {
      customer_number: claims.customer_number,
      employee_number: claims.employee_number,
      full_name: claims.full_name,
      email: claims.email,
      account_status: claims.account_status,
      loyalty_points: claims.loyalty_points,
      role: claims.role,
      access_role: claims.access_role,
      department: claims.department,
      entity: claims.entity,
    };
    next();
  } catch {
    res.status(401).json({ error: "invalid_or_expired_token" });
  }
}
