import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long.' })
  password!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsIn(['QC', 'LC', 'CD'], { message: 'Role must be one of QC, LC, CD.' })
  role!: 'QC' | 'LC' | 'CD';

  @IsOptional()
  @IsIn(['A', 'E', 'W', 'X', 'Z'])
  districtCode?: 'A' | 'E' | 'W' | 'X' | 'Z';
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
