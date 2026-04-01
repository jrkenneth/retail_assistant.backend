const HTML_TAG_PATTERN = /<[^>]*>/g;
const NON_PRINTABLE_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export type SanitizedAccessRequest =
  | {
      ok: true;
      resourceRequested: string;
      justification: string;
    }
  | {
      ok: false;
      error: string;
    };

function cleanText(value: string): string {
  return value.replace(HTML_TAG_PATTERN, "").replace(NON_PRINTABLE_PATTERN, "").trim();
}

export function sanitizeAccessRequestInput(
  resourceRequested: string,
  justification: string,
): SanitizedAccessRequest {
  const cleanedResourceRequested = cleanText(resourceRequested).slice(0, 200);
  const cleanedJustification = cleanText(justification).slice(0, 500);

  if (!cleanedJustification) {
    return {
      ok: false,
      error: "A justification is required to raise an access request.",
    };
  }

  return {
    ok: true,
    resourceRequested: cleanedResourceRequested,
    justification: cleanedJustification,
  };
}
