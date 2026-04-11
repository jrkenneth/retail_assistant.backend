import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function formatTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function writeEvaluationArtifact(
  prefix: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "evaluation-results");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${prefix}-${formatTimestamp()}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

export function roundPercent(value: number): number {
  return Number((value * 100).toFixed(1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
