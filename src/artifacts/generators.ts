import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import puppeteer from "puppeteer";
import {
  artifactActionContentSchema,
  type ArtifactType,
  type DocxArtifactContent,
  type PptxArtifactContent,
  type XlsxArtifactContent,
} from "./types.js";

export type GeneratedArtifactFile = {
  artifactType: ArtifactType;
  contentJson: Record<string, unknown> | null;
  htmlPreview: string | null;
  textContent: string | null;
  fileName: string;
  filePath: string;
  mimeType: string;
};

const EXPORT_ROOT = path.resolve(process.cwd(), "storage", "exports");
const require = createRequire(import.meta.url);

function ensureSafeBasename(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "artifact";
}

function extensionForArtifactType(type: ArtifactType): string {
  if (type === "pdf") return "pdf";
  if (type === "pptx") return "pptx";
  if (type === "docx") return "docx";
  if (type === "xlsx") return "xlsx";
  return "txt";
}

function mimeForArtifactType(type: ArtifactType): string {
  if (type === "pdf") return "application/pdf";
  if (type === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (type === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (type === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "text/plain; charset=utf-8";
}

function sanitizeHtmlPreview(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

function isValidHtmlPreview(html: string): boolean {
  const normalized = html.trim().toLowerCase();
  if (!normalized.includes("<")) {
    return false;
  }
  return /<(html|body|main|article|section|div)[\s>]/i.test(html);
}

async function exportPdf(filePath: string, html: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20_000 });
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

type PptxRuntimeTheme = {
  backgroundColor: string;
  surfaceColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  headingFont: string;
  bodyFont: string;
};

function toPptxColor(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{3,8}$/.test(normalized) ? normalized : fallback;
}

function resolvePptxTheme(content: PptxArtifactContent): PptxRuntimeTheme {
  return {
    backgroundColor: toPptxColor(content.theme?.backgroundColor, "F8FAFC"),
    surfaceColor: toPptxColor(content.theme?.surfaceColor, "FFFFFF"),
    accentColor: toPptxColor(content.theme?.accentColor, "0EA5E9"),
    textColor: toPptxColor(content.theme?.textColor, "0F172A"),
    mutedColor: toPptxColor(content.theme?.mutedColor, "475569"),
    headingFont: content.theme?.headingFont?.trim() || "Aptos Display",
    bodyFont: content.theme?.bodyFont?.trim() || "Aptos",
  };
}

function addSlideChrome(slide: any, title: string, subtitle: string | undefined, theme: PptxRuntimeTheme, accentColor?: string): void {
  const slideAccent = toPptxColor(accentColor, theme.accentColor);
  slide.background = { color: theme.backgroundColor };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.18,
    line: { color: slideAccent, transparency: 100 },
    fill: { color: slideAccent },
  });
  slide.addText(title, {
    x: 0.55,
    y: 0.38,
    w: 10.8,
    h: 0.7,
    fontFace: theme.headingFont,
    bold: true,
    fontSize: 24,
    color: theme.textColor,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.58,
      y: 1.02,
      w: 10.8,
      h: 0.32,
      fontFace: theme.bodyFont,
      fontSize: 11,
      italic: true,
      color: theme.mutedColor,
    });
  }
}

function renderParagraphBlock(slide: any, paragraphs: string[], x: number, y: number, w: number, h: number, theme: PptxRuntimeTheme): void {
  if (paragraphs.length === 0) {
    return;
  }
  slide.addText(paragraphs.join("\n\n"), {
    x,
    y,
    w,
    h,
    fontFace: theme.bodyFont,
    fontSize: 16,
    color: theme.textColor,
    margin: 0.05,
    breakLine: false,
    valign: "top",
  });
}

function renderBulletBlock(slide: any, bullets: string[], x: number, y: number, w: number, h: number, theme: PptxRuntimeTheme): void {
  if (bullets.length === 0) {
    return;
  }
  slide.addText(
    bullets.map((bullet) => ({
      text: bullet,
      options: { bullet: { indent: 18 } },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: theme.bodyFont,
      fontSize: 16,
      color: theme.textColor,
      breakLine: true,
      valign: "top",
    },
  );
}

function renderTableBlock(
  slide: any,
  table: NonNullable<PptxArtifactContent["slides"][number]["table"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: PptxRuntimeTheme,
): void {
  slide.addTable([table.columns, ...table.rows], {
    x,
    y,
    w,
    h,
    border: { type: "solid", pt: 1, color: "CBD5E1" },
    fill: theme.surfaceColor,
    color: theme.textColor,
    fontFace: theme.bodyFont,
    fontSize: 12,
    margin: 0.08,
    bold: true,
  });
}

function renderSlideFooter(slide: any, notes: string[] | undefined, theme: PptxRuntimeTheme): void {
  if (!notes || notes.length === 0) {
    return;
  }
  slide.addText(notes.join(" • "), {
    x: 0.6,
    y: 6.85,
    w: 12.0,
    h: 0.22,
    fontFace: theme.bodyFont,
    fontSize: 9,
    color: theme.mutedColor,
    align: "right",
  });
}

function renderContentSlide(slide: any, slideDef: PptxArtifactContent["slides"][number], theme: PptxRuntimeTheme): void {
  addSlideChrome(slide, slideDef.title, slideDef.subtitle, theme, slideDef.accentColor);
  const hasTable = Boolean(slideDef.table);
  renderParagraphBlock(slide, slideDef.paragraphs, 0.65, 1.48, hasTable ? 6.0 : 12.0, 2.2, theme);
  renderBulletBlock(
    slide,
    slideDef.bullets,
    0.85,
    slideDef.paragraphs.length > 0 ? 3.85 : 1.55,
    hasTable ? 5.7 : 11.2,
    hasTable ? 2.15 : 4.1,
    theme,
  );
  if (slideDef.table) {
    renderTableBlock(slide, slideDef.table, 6.95, 1.55, 5.7, 4.8, theme);
  }
  renderSlideFooter(slide, slideDef.notes, theme);
}

function renderColumnsSlide(slide: any, slideDef: PptxArtifactContent["slides"][number], theme: PptxRuntimeTheme): void {
  addSlideChrome(slide, slideDef.title, slideDef.subtitle, theme, slideDef.accentColor);
  const columns = slideDef.columns && slideDef.columns.length > 0
    ? slideDef.columns
    : [
        { heading: undefined, paragraphs: slideDef.paragraphs, bullets: slideDef.bullets },
        { heading: undefined, paragraphs: [], bullets: [] },
      ];
  const columnWidth = columns.length === 3 ? 3.7 : 5.7;
  columns.forEach((column, index) => {
    const x = 0.6 + index * (columnWidth + 0.25);
    slide.addShape("roundRect", {
      x,
      y: 1.45,
      w: columnWidth,
      h: 4.95,
      rectRadius: 0.08,
      line: { color: "D9E2EC", pt: 1 },
      fill: { color: theme.surfaceColor },
    });
    if (column.heading) {
      slide.addText(column.heading, {
        x: x + 0.2,
        y: 1.68,
        w: columnWidth - 0.4,
        h: 0.28,
        fontFace: theme.headingFont,
        fontSize: 14,
        bold: true,
        color: theme.textColor,
      });
    }
    renderParagraphBlock(slide, column.paragraphs, x + 0.2, column.heading ? 2.0 : 1.7, columnWidth - 0.4, 1.8, theme);
    renderBulletBlock(slide, column.bullets, x + 0.2, column.heading ? 3.75 : 3.2, columnWidth - 0.4, 2.2, theme);
  });
  renderSlideFooter(slide, slideDef.notes, theme);
}

function renderMetricsSlide(slide: any, slideDef: PptxArtifactContent["slides"][number], theme: PptxRuntimeTheme): void {
  addSlideChrome(slide, slideDef.title, slideDef.subtitle, theme, slideDef.accentColor);
  const metrics = slideDef.metrics ?? [];
  const cardWidth = metrics.length >= 4 ? 2.85 : metrics.length === 3 ? 3.8 : 5.8;
  metrics.forEach((metric, index) => {
    const x = 0.65 + index * (cardWidth + 0.22);
    slide.addShape("roundRect", {
      x,
      y: 1.6,
      w: cardWidth,
      h: 2.2,
      rectRadius: 0.08,
      line: { color: toPptxColor(slideDef.accentColor, theme.accentColor), pt: 1 },
      fill: { color: theme.surfaceColor },
    });
    slide.addText(metric.label, {
      x: x + 0.2,
      y: 1.86,
      w: cardWidth - 0.4,
      h: 0.25,
      fontFace: theme.bodyFont,
      fontSize: 12,
      color: theme.mutedColor,
    });
    slide.addText(metric.value, {
      x: x + 0.2,
      y: 2.18,
      w: cardWidth - 0.4,
      h: 0.5,
      fontFace: theme.headingFont,
      fontSize: 24,
      bold: true,
      color: theme.textColor,
    });
    if (metric.context) {
      slide.addText(metric.context, {
        x: x + 0.2,
        y: 2.82,
        w: cardWidth - 0.4,
        h: 0.5,
        fontFace: theme.bodyFont,
        fontSize: 10,
        color: theme.mutedColor,
      });
    }
  });
  renderParagraphBlock(slide, slideDef.paragraphs, 0.65, 4.15, 12.0, 0.95, theme);
  renderBulletBlock(slide, slideDef.bullets, 0.85, 5.05, 11.2, 1.25, theme);
  renderSlideFooter(slide, slideDef.notes, theme);
}

function renderQuoteSlide(slide: any, slideDef: PptxArtifactContent["slides"][number], theme: PptxRuntimeTheme): void {
  const backgroundColor = toPptxColor(slideDef.backgroundColor, theme.backgroundColor);
  const accentColor = toPptxColor(slideDef.accentColor, theme.accentColor);
  slide.background = { color: backgroundColor };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    line: { color: backgroundColor, transparency: 100 },
    fill: { color: backgroundColor },
  });
  slide.addText(slideDef.title, {
    x: 0.8,
    y: 0.55,
    w: 11.7,
    h: 0.4,
    fontFace: theme.bodyFont,
    fontSize: 13,
    color: accentColor,
    bold: true,
    align: "center",
  });
  if (slideDef.quote) {
    slide.addText(`“${slideDef.quote.text}”`, {
      x: 1.2,
      y: 1.65,
      w: 10.9,
      h: 2.8,
      fontFace: theme.headingFont,
      fontSize: 26,
      italic: true,
      color: theme.textColor,
      align: "center",
      valign: "mid",
      margin: 0.1,
    });
    if (slideDef.quote.attribution) {
      slide.addText(slideDef.quote.attribution, {
        x: 3.2,
        y: 4.8,
        w: 6.9,
        h: 0.35,
        fontFace: theme.bodyFont,
        fontSize: 12,
        color: theme.mutedColor,
        align: "center",
      });
    }
  }
  renderParagraphBlock(slide, slideDef.paragraphs, 1.4, 5.35, 10.5, 0.8, theme);
  renderSlideFooter(slide, slideDef.notes, theme);
}

function renderCoverOrSectionSlide(
  slide: any,
  slideDef: PptxArtifactContent["slides"][number],
  theme: PptxRuntimeTheme,
  variant: "cover" | "section",
): void {
  const backgroundColor = toPptxColor(slideDef.backgroundColor, variant === "cover" ? theme.accentColor : theme.backgroundColor);
  const accentColor = toPptxColor(slideDef.accentColor, variant === "cover" ? theme.surfaceColor : theme.accentColor);
  const titleColor = variant === "cover" ? theme.surfaceColor : theme.textColor;
  slide.background = { color: backgroundColor };
  if (variant === "section") {
    slide.addShape("rect", {
      x: 0.7,
      y: 1.35,
      w: 0.18,
      h: 3.5,
      line: { color: accentColor, transparency: 100 },
      fill: { color: accentColor },
    });
  }
  slide.addText(slideDef.title, {
    x: variant === "cover" ? 1.0 : 1.2,
    y: variant === "cover" ? 2.0 : 2.25,
    w: variant === "cover" ? 11.2 : 10.2,
    h: 1.1,
    fontFace: theme.headingFont,
    fontSize: variant === "cover" ? 30 : 28,
    bold: true,
    color: titleColor,
    align: variant === "cover" ? "center" : "left",
  });
  if (slideDef.subtitle) {
    slide.addText(slideDef.subtitle, {
      x: variant === "cover" ? 1.8 : 1.25,
      y: variant === "cover" ? 3.15 : 3.15,
      w: variant === "cover" ? 9.8 : 8.4,
      h: 0.7,
      fontFace: theme.bodyFont,
      fontSize: 16,
      color: variant === "cover" ? theme.surfaceColor : theme.mutedColor,
      align: variant === "cover" ? "center" : "left",
      margin: 0.05,
    });
  }
  if (slideDef.paragraphs.length > 0) {
    renderParagraphBlock(slide, slideDef.paragraphs, 1.25, 4.35, 10.8, 1.2, {
      ...theme,
      textColor: titleColor,
      mutedColor: variant === "cover" ? theme.surfaceColor : theme.mutedColor,
    });
  }
  renderSlideFooter(slide, slideDef.notes, {
    ...theme,
    mutedColor: variant === "cover" ? theme.surfaceColor : theme.mutedColor,
  });
}

async function exportPptx(filePath: string, title: string, content: PptxArtifactContent): Promise<void> {
  const moduleLoader = new Function("m", "return import(m);") as (
    moduleName: string,
  ) => Promise<Record<string, unknown>>;
  const esmModule = await moduleLoader("pptxgenjs");
  const cjsModule = require("pptxgenjs") as Record<string, unknown>;
  const candidate =
    (esmModule.default as unknown) ??
    esmModule ??
    (cjsModule.default as unknown) ??
    cjsModule;
  const PptxGenJS =
    typeof candidate === "function"
      ? (candidate as new () => any)
      : typeof (candidate as { default?: unknown }).default === "function"
        ? (candidate as { default: new () => any }).default
        : null;

  if (!PptxGenJS) {
    throw new Error("pptxgenjs_not_available");
  }

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Lena";
  pptx.subject = title;
  pptx.title = title;
  const theme = resolvePptxTheme(content);

  for (const slideDef of content.slides) {
    const slide = pptx.addSlide();
    if (slideDef.layout === "cover" || slideDef.layout === "section") {
      renderCoverOrSectionSlide(slide, slideDef, theme, slideDef.layout);
    } else if (slideDef.layout === "two-column" || slideDef.layout === "comparison") {
      renderColumnsSlide(slide, slideDef, theme);
    } else if (slideDef.layout === "metrics") {
      renderMetricsSlide(slide, slideDef, theme);
    } else if (slideDef.layout === "quote") {
      renderQuoteSlide(slide, slideDef, theme);
    } else if (slideDef.layout === "table" && slideDef.table) {
      addSlideChrome(slide, slideDef.title, slideDef.subtitle, theme, slideDef.accentColor);
      renderTableBlock(slide, slideDef.table, 0.7, 1.6, 11.9, 4.9, theme);
      renderParagraphBlock(slide, slideDef.paragraphs, 0.75, 6.65, 11.8, 0.28, theme);
      renderSlideFooter(slide, slideDef.notes, theme);
    } else {
      renderContentSlide(slide, slideDef, theme);
    }
  }

  await pptx.writeFile({ fileName: filePath });
}

function buildDocxTable(columns: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: columns.map(
          (column) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: column, bold: true })],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph(String(cell ?? ""))],
                }),
            ),
          }),
      ),
    ],
  });
}

async function exportDocx(filePath: string, title: string, content: DocxArtifactContent): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: content.title ?? title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
  ];

  if (content.subtitle) {
    children.push(
      new Paragraph({
        text: content.subtitle,
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
      }),
    );
  }

  for (const section of content.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 120 },
      }),
    );

    for (const paragraph of section.paragraphs) {
      children.push(
        new Paragraph({
          text: paragraph,
          spacing: { after: 120 },
        }),
      );
    }

    for (const bullet of section.bullets) {
      children.push(
        new Paragraph({
          text: bullet,
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      );
    }

    if (section.table) {
      children.push(buildDocxTable(section.table.columns, section.table.rows));
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  await writeFile(filePath, buffer);
}

function normalizeWorkbookCell(value: unknown): unknown {
  if (value && typeof value === "object" && "formula" in (value as Record<string, unknown>)) {
    return { formula: String((value as { formula: unknown }).formula) };
  }
  return value;
}

async function exportXlsx(filePath: string, content: XlsxArtifactContent): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lena";
  workbook.title = content.workbookTitle ?? "Generated workbook";

  for (const sheet of content.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20,
    }));
    worksheet.getRow(1).font = { bold: true };

    for (const row of sheet.rows) {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, normalizeWorkbookCell(value)]),
      );
      worksheet.addRow(normalizedRow);
    }

    sheet.columns.forEach((column, index) => {
      const worksheetColumn = worksheet.getColumn(index + 1);
      if (column.type === "currency") {
        worksheetColumn.numFmt = '"$"#,##0.00';
      } else if (column.type === "percent") {
        worksheetColumn.numFmt = "0.00%";
      } else if (column.type === "date") {
        worksheetColumn.numFmt = "yyyy-mm-dd";
      }
    });
  }

  await workbook.xlsx.writeFile(filePath);
}

export async function materializeArtifactFile(
  title: string,
  artifactType: ArtifactType,
  content: unknown,
): Promise<GeneratedArtifactFile> {
  const parsed = artifactActionContentSchema.parse({ artifact_type: artifactType, content });
  await mkdir(EXPORT_ROOT, { recursive: true });

  const base = ensureSafeBasename(title);
  const token = randomBytes(4).toString("hex");
  const extension = extensionForArtifactType(artifactType);
  const fileName = `${base}-${Date.now()}-${token}.${extension}`;
  const filePath = path.join(EXPORT_ROOT, fileName);
  const mimeType = mimeForArtifactType(artifactType);

  if (parsed.artifact_type === "pdf") {
    const htmlPreview = sanitizeHtmlPreview(parsed.content.html);
    if (!isValidHtmlPreview(htmlPreview)) {
      throw new Error("artifact_html_invalid");
    }
    await exportPdf(filePath, htmlPreview);
    return {
      artifactType,
      contentJson: null,
      htmlPreview,
      textContent: null,
      fileName,
      filePath,
      mimeType,
    };
  }

  if (parsed.artifact_type === "pptx") {
    await exportPptx(filePath, title, parsed.content);
    return {
      artifactType,
      contentJson: parsed.content as Record<string, unknown>,
      htmlPreview: null,
      textContent: null,
      fileName,
      filePath,
      mimeType,
    };
  }

  if (parsed.artifact_type === "docx") {
    await exportDocx(filePath, title, parsed.content);
    return {
      artifactType,
      contentJson: parsed.content as Record<string, unknown>,
      htmlPreview: null,
      textContent: null,
      fileName,
      filePath,
      mimeType,
    };
  }

  if (parsed.artifact_type === "xlsx") {
    await exportXlsx(filePath, parsed.content);
    return {
      artifactType,
      contentJson: parsed.content as Record<string, unknown>,
      htmlPreview: null,
      textContent: null,
      fileName,
      filePath,
      mimeType,
    };
  }

  await writeFile(filePath, parsed.content.text, "utf8");
  return {
    artifactType,
    contentJson: null,
    htmlPreview: null,
    textContent: parsed.content.text,
    fileName,
    filePath,
    mimeType,
  };
}
