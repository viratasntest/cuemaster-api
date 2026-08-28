import { prisma } from '../lib/prisma';
import { toAppUser, toPlayerProfile } from '../lib/mappers';
import { ApiError } from '../lib/errors';
import { avatarUrlFor, deleteAvatarFile, filenameFromOwnUploadUrl } from '../lib/uploads';
import type { AppUser, PlayerProfile, UpdateProfileInput } from '../types';

export const userService = {
  async getUser(userId: string): Promise<AppUser | null> {
    const row = await prisma.user.findUnique({ where: { id: userId } });
    return row ? toAppUser(row) : null;
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AppUser> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw ApiError.notFound('User not found');

    const isPlayer = existing.role === 'player';
    const row = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName ?? undefined,
        avatarUrl: input.avatarUrl ?? undefined,
        ...(isPlayer
          ? { bio: input.bio ?? undefined }
          : {
              clubName: input.clubName ?? undefined,
              // A club's displayName mirrors its clubName in the mock's shape;
              // keep them in sync unless the caller set displayName explicitly.
              ...(input.clubName !== undefined && input.displayName === undefined
                ? { displayName: input.clubName }
                : {}),
              address: input.address ?? undefined,
              phone: input.phone ?? undefined,
            }),
      },
    });
    return toAppUser(row);
  },

  /** POST /users/me/avatar — see docs/BACKEND.md's Avatar Upload section.
   * Stores the file on disk under uploads/ (see lib/uploads.ts) and points
   * avatarUrl at a publicly-servable URL for it (app.ts serves that directory
   * statically). Deletes the user's previous avatar file if it was one we
   * generated — never if it's an external URL (e.g. a Google/Facebook
   * profile picture from social login), which we don't own and can't delete. */
  async saveAvatar(userId: string, filename: string): Promise<AppUser> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw ApiError.notFound('User not found');

    const previousFilename = filenameFromOwnUploadUrl(existing.avatarUrl);
    const row = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: avatarUrlFor(filename) } });
    if (previousFilename && previousFilename !== filename) deleteAvatarFile(previousFilename);

    return toAppUser(row);
  },

  /** Username prefix/contains match, case-insensitive — usernames are stored
   * canonically lowercase (see schemas.ts), so lowercasing the query and doing
   * a plain `contains` works identically regardless of Mongo's collation. */
  async searchPlayersByUsername(query: string, excludeUserId?: string): Promise<PlayerProfile[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const rows = await prisma.user.findMany({
      where: {
        role: 'player',
        username: { contains: normalized },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      take: 20,
    });
    return rows.map(toPlayerProfile);
  },
};
