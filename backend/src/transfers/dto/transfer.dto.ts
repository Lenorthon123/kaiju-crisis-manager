import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTransferDto {
  @IsIn(['A', 'E', 'W', 'X', 'Z'])
  sourceDistrict!: 'A' | 'E' | 'W' | 'X' | 'Z';

  @IsIn(['A', 'E', 'W', 'X', 'Z'])
  destinationDistrict!: 'A' | 'E' | 'W' | 'X' | 'Z';

  @IsString()
  resourceCode!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsIn(['DIRECT', 'TRANSIT', 'MARITIME'])
  mode?: 'DIRECT' | 'TRANSIT' | 'MARITIME';

  @IsOptional()
  @IsBoolean()
  requisition?: boolean;
}

export class RejectTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
