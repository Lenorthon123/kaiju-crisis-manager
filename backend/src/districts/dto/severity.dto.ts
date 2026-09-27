import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSeverityDto {
  @IsInt()
  @Min(1)
  @Max(5)
  severity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
