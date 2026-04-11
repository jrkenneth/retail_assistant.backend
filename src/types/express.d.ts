import type { AuthenticatedCustomer, AuthenticatedUser, AuthTokenClaims } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      customer?: AuthenticatedCustomer;
      user?: AuthenticatedUser;
      auth?: AuthTokenClaims;
    }
  }
}

export {};
