import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SetLevelDto {
  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}

export class LowerRetentionDto {
  @IsNumber()
  pct!: number;

  @IsOptional()
  @IsIn(['A', 'E', 'W', 'X', 'Z'])
  districtCode?: 'A' | 'E' | 'W' | 'X' | 'Z';

  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
