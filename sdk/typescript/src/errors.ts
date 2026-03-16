/**
 * Soledgic SDK Error Classes
 * Typed errors with HTTP status mapping
 */

export class SoledgicError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
    public code?: string,
  ) {
    super(message)
    this.name = 'SoledgicError'
  }
}

export class ValidationError extends SoledgicError {
  constructor(message: string, details?: unknown, code = 'VALIDATION_ERROR') {
    super(message, 400, details, code)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends SoledgicError {
  constructor(message: string = 'Invalid API key', details?: unknown, code = 'AUTHENTICATION_ERROR') {
    super(message, 401, details, code)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends SoledgicError {
  constructor(message: string, details?: unknown, code = 'NOT_FOUND') {
    super(message, 404, details, code)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends SoledgicError {
  constructor(message: string, details?: unknown, code = 'CONFLICT') {
    super(message, 409, details, code)
    this.name = 'ConflictError'
  }
}
