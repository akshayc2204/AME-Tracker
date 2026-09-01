import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'

export class UpdateFolderSyncDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  folderPath?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  intervalMinutes?: number
}
