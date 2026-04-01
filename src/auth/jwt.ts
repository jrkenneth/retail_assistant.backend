import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import type { AuthenticatedUser, AuthTokenClaims } from "./types.js";

const TOKEN_EXPIRY = "8h";

export function signAuthToken(user: AuthenticatedUser): string {
  return jwt.sign(user, env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    jwtid: randomUUID(),
  });
}

export function verifyAuthToken(token: string): AuthTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & AuthenticatedUser;

  if (
    typeof decoded.jti !== "string" ||
    typeof decoded.exp !== "number" ||
    typeof decoded.iat !== "number"
  ) {
    throw new Error("invalid_token_claims");
  }

  return decoded as AuthTokenClaims;
}
