import { Router } from "express";
import { z } from "zod";
import { getPresentationById, listPresentations, markPresentationExported } from "../db/repositories/presentationsRepo.js";
import { exportPresentationFromHtml, type ExportFormat } from "../presentations/exporters.js";

const exportSchema = z.object({
  format: z.enum(["pdf", "pptx"]),
});

export const presentationsRouter = Router();

presentationsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await listPresentations(200);
    res.status(200).json({
      items: rows.map((row) => ({
        id: row.id,
        session_id: row.session_id,
        title: row.title,
        prompt: row.prompt,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

presentationsRouter.get("/:presentationId", async (req, res, next) => {
  try {
    const row = await getPresentationById(req.params.presentationId);
    if (!row) {
      res.status(404).json({ error: "presentation_not_found" });
      return;
    }
    res.status(200).json(row);
  } catch (error) {
    next(error);
  }
});

presentationsRouter.get("/:presentationId/html", async (req, res, next) => {
  try {
    const row = await getPresentationById(req.params.presentationId);
    if (!row) {
      res.status(404).json({ error: "presentation_not_found" });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(row.html_content);
  } catch (error) {
    next(error);
  }
});

presentationsRouter.post("/:presentationId/export", async (req, res, next) => {
  try {
    const row = await getPresentationById(req.params.presentationId);
    if (!row) {
      res.status(404).json({ error: "presentation_not_found" });
      return;
    }
    const payload = exportSchema.parse(req.body);
    const artifact = await exportPresentationFromHtml(
      row.title,
      row.html_content,
      payload.format as ExportFormat,
    );
    await markPresentationExported(row.id);
    res.status(200).json({
      presentation_id: row.id,
      format: payload.format,
      file_name: artifact.fileName,
      download_url: `/exports/${artifact.fileName}`,
      mime_type: artifact.mimeType,
    });
  } catch (error) {
    next(error);
  }
});
