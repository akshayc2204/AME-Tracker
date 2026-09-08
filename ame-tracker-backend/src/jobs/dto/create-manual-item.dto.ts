import { Type } from 'class-transformer'
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

/**
 * Fields mapped onto Item for Item Schedule / gauge / gate-pass reports.
 * Notes/instructions intentionally omitted.
 */
export class CreateManualItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  pieceNumber!: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fitting!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  itemId?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemTrackingNo?: number

  @IsOptional()
  @IsString()
  @MaxLength(120)
  metal?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  gauge?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  liner?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  dimensions?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  area?: number

  @IsOptional()
  @IsString()
  @MaxLength(120)
  drawing?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  floor?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  systemName?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pressure?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  length?: string
}
