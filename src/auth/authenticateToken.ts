import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "./jwt.js";
import { isBlacklisted } from "./tokenBlacklist.js";
import type { AuthenticatedCustomer } from "./types.js";

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

    const customer: AuthenticatedCustomer = {
      customer_id: claims.customer_id,
      customer_number: claims.customer_number,
      first_name: claims.first_name,
      last_name: claims.last_name,
      full_name: `${claims.first_name} ${claims.last_name}`.trim(),
      email: claims.email,
      account_status: claims.account_status,
      loyalty_points: claims.loyalty_points,
      role: "Customer",
      access_role: "customer",
      department: "Customers",
      entity: "Velora",
    };

    req.auth = claims;
    req.customer = customer;
    req.user = customer;
    next();
  } catch {
    res.status(401).json({ error: "invalid_or_expired_token" });
  }
}
