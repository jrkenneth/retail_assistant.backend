export interface AuthenticatedCustomer {
  customer_id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  account_status: string;
  loyalty_points: number;
  role: string;
  access_role: import("../rbac/types.js").AccessRole;
  department: string;
  entity: string;
}

export type AuthenticatedUser = AuthenticatedCustomer;

export interface AuthTokenClaims {
  customer_id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  email: string;
  loyalty_points: number;
  account_status: string;
  jti: string;
  exp: number;
  iat: number;
}
