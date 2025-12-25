/**
 * Logger Utility
 * Production-safe logging with log levels
 */

/* eslint-disable no-console */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// In production, only show warnings and errors
// In development, show everything
const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'debug'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL]
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`
  return data ? `${prefix} ${message}` : `${prefix} ${message}`
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog('debug')) {
      if (data !== undefined) {
        console.debug(formatMessage('debug', message), data)
      } else {
        console.debug(formatMessage('debug', message))
      }
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog('info')) {
      if (data !== undefined) {
        console.info(formatMessage('info', message), data)
      } else {
        console.info(formatMessage('info', message))
      }
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog('warn')) {
      if (data !== undefined) {
        console.warn(formatMessage('warn', message), data)
      } else {
        console.warn(formatMessage('warn', message))
      }
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog('error')) {
      if (data !== undefined) {
        console.error(formatMessage('error', message), data)
      } else {
        console.error(formatMessage('error', message))
      }
    }
  },
}

export default logger
