import { IsDateString, IsIn, IsInt, IsString, Min } from 'class-validator';

export class CreateReservationDto {
  @IsIn(['A', 'E', 'W', 'X', 'Z'])
  districtCode!: 'A' | 'E' | 'W' | 'X' | 'Z';

  @IsString()
  resourceCode!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;
}
