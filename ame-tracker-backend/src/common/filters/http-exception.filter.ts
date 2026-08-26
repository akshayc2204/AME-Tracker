import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let code = 'INTERNAL_ERROR'
    let message = 'An unexpected error occurred'
    let details: unknown

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      if (typeof body === 'string') {
        message = body
        code = this.codeFromStatus(status)
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>
        message = String(obj.message ?? message)
        code = String(obj.errorCode ?? obj.error ?? this.codeFromStatus(status))
        details = obj.details
        if (Array.isArray(obj.message)) {
          message = obj.message.join(', ')
          code = 'VALIDATION_ERROR'
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack)
      if (
        /Failed to connect|ETIMEOUT|ECONNREFUSED|ECONNRESET|not connected to Trimble|SQL Server is unreachable|Failed to cancel|timed out/i.test(
          exception.message,
        )
      ) {
        status = HttpStatus.SERVICE_UNAVAILABLE
        code = 'FABSHOP_UNAVAILABLE'
        message =
          exception.message.includes('TrimbleFabShop') || exception.message.includes('SQL Server')
            ? exception.message
            : 'TrimbleFabShop SQL Server is unreachable. Check that SQL Server is running on port 1433.'
      }
    }

    response.status(status).json({
      success: false,
      error: {
        code: typeof code === 'string' ? code.toString().toUpperCase().replace(/\s+/g, '_') : 'ERROR',
        message,
        ...(details !== undefined ? { details } : {}),
      },
    })
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST'
      case 401:
        return 'UNAUTHORIZED'
      case 403:
        return 'FORBIDDEN'
      case 404:
        return 'NOT_FOUND'
      case 409:
        return 'CONFLICT'
      case 503:
        return 'SERVICE_UNAVAILABLE'
      default:
        return 'ERROR'
    }
  }
}
