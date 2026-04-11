import { Router } from "express";
import { sanitizeAccessRequestInput } from "../accessRequests/sanitizeAccessRequest.js";
import { createAccessRequest, listAccessRequestsByEmployee } from "../db/repositories/accessRequestsRepo.js";
import { asyncRoute } from "./routeUtils.js";
import { createAccessRequestSchema } from "./schemas.js";

const makeReferenceNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `AR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${timestamp.slice(-6)}`;
};

export const accessRequestsRouter = Router();

accessRequestsRouter.get("/", asyncRoute(async (req, res) => {
  const items = await listAccessRequestsByEmployee(req.customer!.customer_number, 100);
  res.status(200).json({ items });
}));

accessRequestsRouter.post("/", asyncRoute(async (req, res) => {
  const payload = createAccessRequestSchema.parse(req.body);
  const sanitized = sanitizeAccessRequestInput(payload.resource_requested, payload.justification);
  if (!sanitized.ok) {
    res.status(400).json({ error: sanitized.error });
    return;
  }

  const timestamp = Date.now().toString(36).toUpperCase();
  const row = await createAccessRequest({
    id: `access-${timestamp}`,
    referenceNumber: makeReferenceNumber(),
    requestedBy: req.customer!.customer_number,
    requestedRole: req.customer!.access_role,
    resourceRequested: sanitized.resourceRequested,
    justification: sanitized.justification,
  });

  res.status(201).json({
    id: row.id,
    reference_number: row.reference_number,
    requested_by: row.requested_by,
    requested_role: row.requested_role,
    resource_requested: row.resource_requested,
    justification: row.justification,
    status: row.status,
    created_at: row.created_at,
  });
}));
