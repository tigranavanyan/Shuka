/** Every error leaves the API as { error: { code, message, details? } }. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'INVALID_INPUT', message, details);
export const unauthorized = (message = 'Please sign in.') => new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You are not allowed to do that.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (code, message, details) => new ApiError(409, code, message, details);

/** Wrap an async/sync route so thrown errors reach the error handler. */
export const h = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }
  // multer errors (file too large, too many files, ...)
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 5 MB or smaller.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'You can upload at most 5 images.'
        : `Upload failed: ${err.message}`;
    return res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: msg } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Request body is not valid JSON.' } });
  }
  if (err && err.code === 'SQLITE_BUSY') {
    console.error('SQLITE_BUSY', err);
    return res.status(503).json({ error: { code: 'BUSY', message: 'The server is busy, please retry.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
