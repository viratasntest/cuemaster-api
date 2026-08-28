import type { User as UserRow } from '@prisma/client';
import type { AppUser, ClubProfile, PlayerProfile } from '../types';

/** Converts a DB user row (role-specific columns nullable, plus passwordHash)
 * into the discriminated `AppUser` shape the API contract promises — and
 * makes sure passwordHash never leaks into a response. */
export function toAppUser(row: UserRow): AppUser {
  const base = {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };

  if (row.role === 'player') {
    const profile: PlayerProfile = {
      ...base,
      role: 'player',
      username: row.username ?? '',
      bio: row.bio ?? undefined,
      homeClubId: row.homeClubId ?? undefined,
    };
    return profile;
  }

  const profile: ClubProfile = {
    ...base,
    role: 'club',
    clubName: row.clubName ?? row.displayName,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
  };
  return profile;
}

export function toPlayerProfile(row: UserRow): PlayerProfile {
  const user = toAppUser(row);
  if (user.role !== 'player') {
    throw new Error(`Expected player, got ${user.role} for user ${row.id}`);
  }
  return user;
}
