import { IsOptional, IsString, MinLength } from 'class-validator'

export class ScanDto {
  @IsString()
  @MinLength(1)
  qrCode!: string

  @IsOptional()
  @IsString()
  requestId?: string

  @IsOptional()
  @IsString()
  source?: string
}
