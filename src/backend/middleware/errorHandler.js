// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Global middleware that catches application errors, logs stack traces, and returns standardized JSON error responses.



const ApplicationError = require("../exceptions/AppError");

function errorHandler(err, req, res, next) {
  if (err instanceof ApplicationError) {
    return res.status(err?.statusCode || err?.code || 500).json({
      success: false,
      message: err.message,
    });
  }
  let status = err?.statusCode || err?.code || 500
  return res.status(status).json({
    success: false,
    message: err.message,
  });
}

module.exports = errorHandler;
