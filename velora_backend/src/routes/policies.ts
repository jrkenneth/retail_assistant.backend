import { Router } from "express";
import db from "../db/knex.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parsePagination } from "../utils.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const policyKey = typeof req.query.policy_key === "string" ? req.query.policy_key.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const query = db("policy_documents").select(
      "id",
      "policy_key",
      "title",
      "content",
      "version",
      "effective_date",
      "created_at",
      "updated_at"
    );

    if (policyKey) {
      query.where("policy_key", policyKey);
    }

    if (search) {
      query.where((builder) => {
        builder.whereILike("title", `%${search}%`);
        builder.orWhereILike("content", `%${search}%`);
        builder.orWhereILike("policy_key", `%${search}%`);
      });
    }

    query.orderBy("effective_date", "desc");
    const result = await paginate(query, pagination, "id");
    res.status(200).json(result);
  })
);

router.get(
  "/:policyKey",
  asyncHandler(async (req, res) => {
    const policy = await db("policy_documents")
      .select(
        "id",
        "policy_key",
        "title",
        "content",
        "version",
        "effective_date",
        "created_at",
        "updated_at"
      )
      .where("policy_key", req.params.policyKey)
      .first();

    if (!policy) {
      throw notFound("Policy not found");
    }

    const chunks = await db("policy_chunks")
      .select("chunk_index", "chunk_text", "created_at")
      .where("policy_document_id", policy.id)
      .orderBy("chunk_index", "asc");

    res.status(200).json({
      data: {
        ...policy,
        chunks,
      },
    });
  })
);

export default router;
