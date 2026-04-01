export interface AuthenticatedUser {
  customer_number: string;
  employee_number: string;
  full_name: string;
  email: string;
  account_status: string;
  loyalty_points: number;
  role: string;
  access_role: import("../rbac/types.js").AccessRole;
  department: string;
  entity: string;
}

export interface AuthTokenClaims extends AuthenticatedUser {
  jti: string;
  exp: number;
  iat: number;
}
