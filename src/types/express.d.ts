import type { AuthenticatedUser, AuthTokenClaims } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      auth?: AuthTokenClaims;
    }
  }
}

export {};
