import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { DistrictCode } from '../domain';
import {
  CatastropheLevelChangedPayload,
  KaijuEvent,
  ResourceUpdatedPayload,
  TransferConflictPayload,
  TransferPayload,
} from './events';

const CITY_ROOM = 'city';
const districtRoom = (code: string) => `district:${code}`;

interface SocketUser {
  id: string;
  role: 'QC' | 'LC' | 'CD';
  districtCode: DistrictCode | null;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // The socket is authenticated at handshake and the SERVER picks the rooms.
  // A QC cannot ask to listen in on a quarter that is none of its business.
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { district: true },
      });
      if (!user) throw new UnauthorizedException();

      const socketUser: SocketUser = {
        id: user.id,
        role: user.role,
        districtCode: user.district ? (user.district.code as DistrictCode) : null,
      };
      client.data.user = socketUser;

      await client.join(CITY_ROOM);
      if (socketUser.role === 'QC' && socketUser.districtCode) {
        await client.join(districtRoom(socketUser.districtCode));
      } else {
        const districts = await this.prisma.district.findMany({ select: { code: true } });
        await Promise.all(districts.map((d) => client.join(districtRoom(d.code))));
      }

      this.logger.log(`Connected ${user.email} (${user.role})`);
    } catch {
      client.emit('error', { code: 'UNAUTHENTICATED', message: 'Invalid or missing token.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as SocketUser | undefined;
    if (user) this.logger.log(`Disconnected ${user.id}`);
  }

  private extractToken(client: Socket): string {
    const fromAuth = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers.authorization;
    if (header) return header.replace(/^Bearer\s+/i, '');

    const query = client.handshake.query?.token;
    if (typeof query === 'string') return query;

    throw new UnauthorizedException('No token supplied at handshake.');
  }

  emitResourceUpdated(payload: ResourceUpdatedPayload): void {
    this.server.to(districtRoom(payload.districtCode)).emit(KaijuEvent.RESOURCE_UPDATED, payload);
  }

  emitTransferConflict(payload: TransferConflictPayload): void {
    this.server.to(districtRoom(payload.districtCode)).emit(KaijuEvent.TRANSFER_CONFLICT, payload);
  }

  emitCatastropheLevelChanged(payload: CatastropheLevelChangedPayload): void {
    this.server.to(CITY_ROOM).emit(KaijuEvent.CATASTROPHE_LEVEL_CHANGED, payload);
  }

  emitTransferCreated(payload: TransferPayload): void {
    this.broadcastTransfer(KaijuEvent.TRANSFER_CREATED, payload);
  }

  emitTransferUpdated(payload: TransferPayload): void {
    this.broadcastTransfer(KaijuEvent.TRANSFER_UPDATED, payload);
  }

  emitDistrictSeverityChanged(districtCode: DistrictCode, severity: number): void {
    this.server
      .to(CITY_ROOM)
      .emit(KaijuEvent.DISTRICT_SEVERITY_CHANGED, { districtCode, severity });
  }

  emitRetentionThresholdChanged(payload: {
    districtCode: DistrictCode | null;
    pct: number;
    changedBy: string;
  }): void {
    this.server.to(CITY_ROOM).emit(KaijuEvent.RETENTION_THRESHOLD_CHANGED, payload);
  }

  private broadcastTransfer(event: KaijuEvent, payload: TransferPayload): void {
    const rooms = new Set<string>([
      districtRoom(payload.sourceDistrict),
      districtRoom(payload.destinationDistrict),
      ...payload.transitDistricts.map(districtRoom),
    ]);
    this.server.to([...rooms]).emit(event, payload);
  }
}
