import { HttpException, HttpStatus } from '@nestjs/common'

export class BusinessError extends HttpException {
  constructor(code: string, message: string, status = HttpStatus.CONFLICT) {
    super({ errorCode: code, message }, status)
  }
}
