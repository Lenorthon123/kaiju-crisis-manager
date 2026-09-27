import { Actor, DistrictCode, Role } from '../domain';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  districtId: string | null;
  districtCode: DistrictCode | null;
}

export function toActor(user: AuthenticatedUser): Actor {
  return { id: user.id, role: user.role, districtCode: user.districtCode };
}
