import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer";

export type ExportFormat = "pdf" | "pptx";

export type ExportArtifact = {
  fileName: string;
  filePath: string;
  mimeType: string;
};

type ParsedSlide = {
  title: string;
  bullets: string[];
};

const EXPORT_ROOT = path.resolve(process.cwd(), "storage", "exports");
const require = createRequire(import.meta.url);

function ensureSafeBasename(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "presentation";
}

function mimeForFormat(format: ExportFormat): string {
  if (format === "pdf") {
    return "application/pdf";
  }
  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseSlidesFromHtml(html: string): ParsedSlide[] {
  const sections = [...html.matchAll(/<section[^>]*data-slide="(\d+)"[^>]*>([\s\S]*?)<\/section>/gi)];
  const slides = sections
    .map((match) => {
      const sectionBody = match[2] ?? "";
      const titleRaw = sectionBody.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "Slide";
      const bullets = [...sectionBody.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((item) => stripTags(item[1] ?? ""))
        .filter(Boolean)
        .slice(0, 8);
      return {
        title: stripTags(titleRaw) || "Slide",
        bullets,
      };
    })
    .filter((slide) => slide.title || slide.bullets.length > 0);

  if (slides.length === 0) {
    throw new Error("presentation_html_invalid_no_slides");
  }
  return slides;
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

async function exportPptx(filePath: string, title: string, html: string): Promise<void> {
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
      : typeof (candidate as { default?: unknown })?.default === "function"
        ? ((candidate as { default: new () => any }).default)
        : null;

  if (!PptxGenJS) {
    throw new Error("pptxgenjs_not_available");
  }

  const slides = parseSlidesFromHtml(html);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Rogers Copilot";
  pptx.subject = title;
  pptx.title = title;

  for (const slideDef of slides) {
    const slide = pptx.addSlide();
    slide.addText(slideDef.title, {
      x: 0.6,
      y: 0.4,
      w: 12.0,
      h: 0.8,
      fontFace: "Calibri",
      bold: true,
      fontSize: 28,
      color: "1F2933",
    });

    const bulletLines =
      slideDef.bullets.length > 0
        ? slideDef.bullets.map((bullet) => ({ text: bullet, options: { bullet: { indent: 18 } } }))
        : [{ text: "No bullet points generated.", options: { bullet: { indent: 18 } } }];
    slide.addText(bulletLines, {
      x: 0.9,
      y: 1.5,
      w: 11.6,
      h: 4.8,
      fontFace: "Calibri",
      fontSize: 18,
      color: "2F3C49",
      breakLine: true,
      valign: "top",
    });
  }

  await pptx.writeFile({ fileName: filePath });
}

export async function exportPresentationFromHtml(
  title: string,
  html: string,
  format: ExportFormat,
): Promise<ExportArtifact> {
  await mkdir(EXPORT_ROOT, { recursive: true });
  const base = ensureSafeBasename(title);
  const token = randomBytes(4).toString("hex");
  const extension = format === "pdf" ? "pdf" : "pptx";
  const fileName = `${base}-${Date.now()}-${token}.${extension}`;
  const filePath = path.join(EXPORT_ROOT, fileName);

  if (format === "pdf") {
    await exportPdf(filePath, html);
  } else {
    await exportPptx(filePath, title, html);
  }

  return {
    fileName,
    filePath,
    mimeType: mimeForFormat(format),
  };
}
