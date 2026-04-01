export interface AuthenticatedUser {
  employee_number: string;
  full_name: string;
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
