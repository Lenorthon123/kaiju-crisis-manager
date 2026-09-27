import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AuthenticatedUser } from './authenticated-user';

export interface AuthResult {
  accessToken: string;
  user: Omit<AuthenticatedUser, 'districtId'> & { districtId: string | null };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (dto.role === 'QC' && !dto.districtCode) {
      throw new BadRequestException({
        code: 'QC_REQUIRES_DISTRICT',
        message: 'A Quarter Coordinator must be attached to a quarter.',
      });
    }
    if (dto.role !== 'QC' && dto.districtCode) {
      throw new BadRequestException({
        code: 'ROLE_IS_NOT_QUARTER_SCOPED',
        message: `Role ${dto.role} operates city-wide and cannot be attached to a quarter.`,
      });
    }

    // A QC with no quarter would fail every scope check, so it is refused here
    // rather than at first use.
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An officer is already registered with this email address.',
      });
    }

    let districtId: string | null = null;
    if (dto.districtCode) {
      const district = await this.prisma.district.findUnique({
        where: { code: dto.districtCode },
      });
      if (!district) {
        throw new BadRequestException({
          code: 'UNKNOWN_DISTRICT',
          message: `Unknown quarter ${dto.districtCode}.`,
        });
      }
      districtId = district.id;
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        displayName: dto.displayName,
        role: dto.role,
        districtId,
      },
      include: { district: true },
    });

    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { district: true },
    });

    // Same answer for an unknown account and a wrong password: this endpoint is
    // not a way to find out who works here.
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });

    if (!user) {
      await argon2.hash(dto.password);
      throw invalid;
    }
    if (!(await argon2.verify(user.passwordHash, dto.password))) throw invalid;

    return this.issue(user);
  }

  private issue(user: {
    id: string;
    email: string;
    displayName: string;
    role: 'QC' | 'LC' | 'CD';
    districtId: string | null;
    district: { code: string } | null;
  }): AuthResult {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        districtId: user.districtId,
        districtCode: user.district ? (user.district.code as 'A' | 'E' | 'W' | 'X' | 'Z') : null,
      },
    };
  }
}
