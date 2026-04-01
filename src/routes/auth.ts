import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { aletiaAdapter } from "../adapters/aletia/aletiaAdapter.js";
import { authenticateToken } from "../auth/authenticateToken.js";
import { signAuthToken } from "../auth/jwt.js";
import { addToBlacklist } from "../auth/tokenBlacklist.js";
import type { AuthenticatedUser } from "../auth/types.js";
import { mapAccessRole } from "../rbac/roleMapping.js";
import { asyncRoute } from "./routeUtils.js";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const employeeProfileSchema = z.object({
  employee_number: z.string(),
  full_name: z.string(),
  role: z.string(),
  department: z.string(),
  entity: z.string(),
});

function normalizeAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "authentication_failed";
  }

  if (error.message.includes("invalid username or password")) {
    return "invalid_credentials";
  }

  return "authentication_failed";
}

export const authRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post("/login", loginRateLimiter, asyncRoute(async (req, res) => {
  const payload = loginSchema.parse(req.body);

  try {
    const result = await aletiaAdapter.execute("authenticate_user", payload);
    const employee = employeeProfileSchema.parse(result.data);
    const user = {
      ...employee,
      access_role: mapAccessRole(employee.role, employee.department),
    } satisfies AuthenticatedUser;
    const token = signAuthToken(user);

    res.status(200).json({ token, user });
  } catch (error) {
    const message = normalizeAuthErrorMessage(error);
    const status = message === "invalid_credentials" ? 401 : 502;
    res.status(status).json({ error: message });
  }
}));

authRouter.post("/logout", authenticateToken, asyncRoute(async (req, res) => {
  if (req.auth?.jti) {
    addToBlacklist(req.auth.jti, req.auth.exp * 1000);
  }
  res.status(200).json({ success: true });
}));

authRouter.get("/me", authenticateToken, asyncRoute(async (req, res) => {
  res.status(200).json({ user: req.user });
}));
