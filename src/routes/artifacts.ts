import { Router } from "express";
import path from "node:path";
import { getOwnedArtifactById, listOwnedArtifacts } from "../db/repositories/artifactsRepo.js";
import { asyncRoute, sendNotFound } from "./routeUtils.js";

export const artifactsRouter = Router();

artifactsRouter.get("/", asyncRoute(async (req, res) => {
  const rows = await listOwnedArtifacts(req.customer!.customer_number, 200);
  res.status(200).json({
    items: rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      title: row.title,
      prompt: row.prompt,
      artifact_type: row.artifact_type,
      status: row.status,
      file_name: row.file_name,
      mime_type: row.mime_type,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });
}));

artifactsRouter.get("/:artifactId", asyncRoute(async (req, res) => {
  const row = await getOwnedArtifactById(req.params.artifactId, req.customer!.customer_number);
  if (!row) {
    sendNotFound(res, "artifact_not_found");
    return;
  }

  res.status(200).json({
    id: row.id,
    session_id: row.session_id,
    title: row.title,
    prompt: row.prompt,
    artifact_type: row.artifact_type,
    status: row.status,
    file_name: row.file_name,
    mime_type: row.mime_type,
    has_preview: Boolean(row.html_preview),
    preview_url: row.html_preview ? `/artifacts/${row.id}/preview` : null,
    download_url: row.file_name ? `/artifacts/${row.id}/download` : null,
    metadata_json: row.metadata_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}));

artifactsRouter.get("/:artifactId/preview", asyncRoute(async (req, res) => {
  const row = await getOwnedArtifactById(req.params.artifactId, req.customer!.customer_number);
  if (!row) {
    sendNotFound(res, "artifact_not_found");
    return;
  }
  if (!row.html_preview) {
    sendNotFound(res, "artifact_preview_not_available");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(row.html_preview);
}));

artifactsRouter.get("/:artifactId/download", asyncRoute(async (req, res) => {
  const row = await getOwnedArtifactById(req.params.artifactId, req.customer!.customer_number);
  if (!row) {
    sendNotFound(res, "artifact_not_found");
    return;
  }
  if (!row.file_path || !row.file_name) {
    sendNotFound(res, "artifact_file_not_available");
    return;
  }

  if (row.mime_type) {
    res.setHeader("Content-Type", row.mime_type);
  }
  res.download(row.file_path, path.basename(row.file_name));
}));
