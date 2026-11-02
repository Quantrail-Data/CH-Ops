// errorHandler.js - The last Express error handler.
// Copyright (C) 2026 Quantrail Data Private Limited

import { log } from "../services/logger.js";

// The details of a server error go to the log, not to the client.
// Express finds an error handler by its four arguments, so next must stay.
// eslint-disable-next-line no-unused-vars
export function handleRequestError(err, req, res, next) {
  const status = err?.status || err?.statusCode || 500;
  log.error("Unhandled request error", {
    error: err?.message,
    status,
    path: req.path,
    method: req.method,
  });
  // A client error (for example JSON that cannot be read) can tell the client what is wrong.
  const isClientError = status < 500 && err?.expose !== false;
  let message = "Internal server error";
  if (isClientError && err?.message) message = err.message;
  res.status(status).json({ error: message });
}
