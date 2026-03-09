export const TOOL_TIMEOUT_MS = 15_000;
export const RETRY_ATTEMPTS = 2;
export const BACKOFF_MS = [500, 1000, 2000];
export const TOTAL_REQUEST_BUDGET_MS = 90_000;

export type RetryableErrorCode = "timeout" | "http_429" | "http_5xx" | "network";

export class RetryableToolError extends Error {
  code: RetryableErrorCode;

  constructor(code: RetryableErrorCode, message: string) {
    super(message);
    this.name = "RetryableToolError";
    this.code = code;
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const jitter = () => Math.floor(Math.random() * 120);

export function isRetryable(error: unknown): error is RetryableToolError {
  return error instanceof RetryableToolError;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new RetryableToolError("timeout", "Tool execution timeout"));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
