import { z } from "zod";

export const artifactTypeSchema = z.enum(["pdf", "pptx", "docx", "xlsx", "txt"]);

export type ArtifactType = z.infer<typeof artifactTypeSchema>;

const tableSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).default([]),
});

const pptxThemeSchema = z.object({
  backgroundColor: z.string().min(1).optional(),
  surfaceColor: z.string().min(1).optional(),
  accentColor: z.string().min(1).optional(),
  textColor: z.string().min(1).optional(),
  mutedColor: z.string().min(1).optional(),
  headingFont: z.string().min(1).optional(),
  bodyFont: z.string().min(1).optional(),
});

const pptxTextGroupSchema = z.object({
  heading: z.string().min(1).optional(),
  paragraphs: z.array(z.string().min(1)).default([]),
  bullets: z.array(z.string().min(1)).default([]),
});

const pptxMetricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  context: z.string().min(1).optional(),
});

const pptxQuoteSchema = z.object({
  text: z.string().min(1),
  attribution: z.string().min(1).optional(),
});

export const pdfArtifactContentSchema = z.object({
  html: z.string().min(1),
});

export const txtArtifactContentSchema = z.object({
  text: z.string().min(1),
});

export const pptxArtifactContentSchema = z.object({
  theme: pptxThemeSchema.optional(),
  slides: z.array(
    z.object({
      layout: z.enum(["cover", "section", "content", "two-column", "comparison", "table", "metrics", "quote"]).optional(),
      title: z.string().min(1),
      subtitle: z.string().optional(),
      paragraphs: z.array(z.string().min(1)).default([]),
      bullets: z.array(z.string().min(1)).default([]),
      table: tableSchema.optional(),
      columns: z.array(pptxTextGroupSchema).min(1).max(3).optional(),
      metrics: z.array(pptxMetricSchema).min(1).max(4).optional(),
      quote: pptxQuoteSchema.optional(),
      notes: z.array(z.string().min(1)).default([]),
      accentColor: z.string().min(1).optional(),
      backgroundColor: z.string().min(1).optional(),
    }),
  ).min(1),
});

export const docxArtifactContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).default([]),
      bullets: z.array(z.string().min(1)).default([]),
      table: tableSchema.optional(),
    }),
  ).min(1),
});

const sheetCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ formula: z.string().min(1) }),
]);

export const xlsxArtifactContentSchema = z.object({
  workbookTitle: z.string().optional(),
  sheets: z.array(
    z.object({
      name: z.string().min(1).max(31),
      columns: z.array(
        z.object({
          header: z.string().min(1),
          key: z.string().min(1),
          width: z.number().positive().max(60).optional(),
          type: z.enum(["string", "number", "boolean", "date", "currency", "percent"]).optional(),
        }),
      ).min(1),
      rows: z.array(z.record(sheetCellValueSchema)).default([]),
    }),
  ).min(1),
});

export const artifactActionContentSchema = z.discriminatedUnion("artifact_type", [
  z.object({ artifact_type: z.literal("pdf"), content: pdfArtifactContentSchema }),
  z.object({ artifact_type: z.literal("pptx"), content: pptxArtifactContentSchema }),
  z.object({ artifact_type: z.literal("docx"), content: docxArtifactContentSchema }),
  z.object({ artifact_type: z.literal("xlsx"), content: xlsxArtifactContentSchema }),
  z.object({ artifact_type: z.literal("txt"), content: txtArtifactContentSchema }),
]);

export type PdfArtifactContent = z.infer<typeof pdfArtifactContentSchema>;
export type TxtArtifactContent = z.infer<typeof txtArtifactContentSchema>;
export type PptxArtifactContent = z.infer<typeof pptxArtifactContentSchema>;
export type DocxArtifactContent = z.infer<typeof docxArtifactContentSchema>;
export type XlsxArtifactContent = z.infer<typeof xlsxArtifactContentSchema>;