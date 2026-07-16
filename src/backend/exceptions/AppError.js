// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// ApplicationError is a custom error class used to handle and manage application errors
class ApplicationError extends Error {
  constructor(message, errorCode, statusCode, details = null) {
    super(message);

    this.name = this.constructor.name;
    this.message = message;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
export default ApplicationError;
