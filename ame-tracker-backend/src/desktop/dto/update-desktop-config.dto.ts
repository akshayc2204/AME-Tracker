import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class PostgresSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  host!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  database!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  user!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string
}

export class FabshopSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  server!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  database!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  user!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string

  @IsBoolean()
  encrypt!: boolean
}

export class UpdateDesktopConfigDto {
  @ValidateNested()
  @Type(() => PostgresSettingsDto)
  postgres!: PostgresSettingsDto

  @ValidateNested()
  @Type(() => FabshopSettingsDto)
  fabshop!: FabshopSettingsDto
}
