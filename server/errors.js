export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (message, code = "bad_request") => new ApiError(400, code, message);
export const notFound = (message = "찾을 수 없습니다.") => new ApiError(404, "not_found", message);
