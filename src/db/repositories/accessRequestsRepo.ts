import { db } from "../client.js";

type CreateAccessRequestInput = {
  id: string;
  referenceNumber: string;
  requestedBy: string;
  requestedRole: string;
  resourceRequested: string;
  justification: string;
};

type AccessRequestRow = {
  id: string;
  reference_number: string;
  requested_by: string;
  requested_role: string;
  resource_requested: string;
  justification: string;
  status: string;
  created_at: string;
};

export async function createAccessRequest(
  input: CreateAccessRequestInput,
): Promise<AccessRequestRow> {
  const [row] = await db<AccessRequestRow>("access_requests")
    .insert({
      id: input.id,
      reference_number: input.referenceNumber,
      requested_by: input.requestedBy,
      requested_role: input.requestedRole,
      resource_requested: input.resourceRequested,
      justification: input.justification,
      status: "pending",
    })
    .returning("*");

  return row;
}

export async function listAccessRequestsByEmployee(
  requestedBy: string,
  limit = 100,
): Promise<AccessRequestRow[]> {
  return db<AccessRequestRow>("access_requests")
    .where({ requested_by: requestedBy })
    .orderBy("created_at", "desc")
    .limit(limit);
}
