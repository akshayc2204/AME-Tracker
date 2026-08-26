export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export interface ApiErrorResponse {
  success: false
  error: ApiErrorBody
}

export function ok<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return message ? { success: true, data, message } : { success: true, data }
}
