import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  email!: string

  @IsString()
  @MinLength(6)
  password!: string
}

export class RefreshDto {
  @IsString()
  refreshToken!: string
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  email?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword?: string
}
