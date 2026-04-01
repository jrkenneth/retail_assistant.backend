export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string) =>
  new ApiError(400, "bad_request", message);

export const unauthorized = (
  message = "Invalid or missing API key",
  code = "unauthorized"
) => new ApiError(401, code, message);

export const notFound = (message: string) =>
  new ApiError(404, "not_found", message);

export const unprocessable = (message: string) =>
  new ApiError(422, "invalid_filter_combination", message);
