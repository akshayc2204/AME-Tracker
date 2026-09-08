import { IsOptional, IsString, MinLength } from 'class-validator'

export class CheckImportPairDto {
  @IsString()
  @MinLength(1)
  pairKey!: string

  @IsString()
  @MinLength(1)
  t4vjobHash!: string

  @IsString()
  @MinLength(1)
  xlsxHash!: string

  @IsOptional()
  @IsString()
  sourceJobId?: string
}
