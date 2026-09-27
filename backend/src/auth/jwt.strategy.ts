import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './authenticated-user';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'QC' | 'LC' | 'CD';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // The token carries an identity, never a permission. Role and quarter are
  // re-read on every request, so revoking an officer takes effect at once.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { district: true },
    });

    if (!user) throw new UnauthorizedException('Account no longer exists.');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      districtId: user.districtId,
      districtCode: user.district ? (user.district.code as AuthenticatedUser['districtCode']) : null,
    };
  }
}
