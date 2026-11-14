import type { ApiError } from "@madplan/domain";

export type ErrorStatus = 400 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503;

/** Thrown anywhere in a request; the app's error handler turns it into an ApiError response. */
export class HttpError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;

  constructor(status: ErrorStatus, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toBody(): ApiError {
    return { error: this.code, message: this.message };
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, "bad_request", message);
export const notFound = (message: string): HttpError => new HttpError(404, "not_found", message);
export const conflict = (message: string): HttpError => new HttpError(409, "conflict", message);
export const unprocessable = (message: string): HttpError =>
  new HttpError(422, "unprocessable", message);
export const unavailable = (message: string): HttpError =>
  new HttpError(503, "unavailable", message);
