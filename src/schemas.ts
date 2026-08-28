import { z } from 'zod';

export const playerSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  displayName: z.string().trim().min(1).max(60),
  // Lowercased at the boundary so usernames are case-insensitive handles
  // without needing DB-specific case-insensitive collation/queries — every
  // username in the DB is canonically lowercase, and lookups/search just
  // lowercase their input to match (see services/userService.ts).
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.')
    .toLowerCase(),
});

export const clubSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  clubName: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// `provider` comes from the URL (:provider), not the body — see routes/auth.ts.
export const socialLoginSchema = z.object({
  token: z.string().min(1),
  role: z.enum(['player', 'club']),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  avatarUrl: z.string().trim().url().optional(),
  bio: z.string().trim().max(280).optional(),
  clubName: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
});

export const sendFriendRequestSchema = z.object({
  toUserId: z.string().min(1),
});

export const createSoloMatchSchema = z.object({
  matchTypeId: z.string().min(1),
});

export const ballValueSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export const foulValueSchema = z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);

export const sendInviteSchema = z.object({
  toUserId: z.string().min(1),
  matchTypeId: z.string().min(1),
});

export const respondInviteSchema = z.object({
  inviteId: z.string().min(1),
  accept: z.boolean(),
});

export const cancelInviteSchema = z.object({
  inviteId: z.string().min(1),
});

export const potSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  value: ballValueSchema,
});

export const foulSchema = z.object({
  matchId: z.string().min(1),
  foulingPlayerId: z.string().min(1),
  value: foulValueSchema,
});

export const switchSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
});

export const endFrameSchema = z.object({
  matchId: z.string().min(1),
  winnerId: z.string().min(1),
});

export const concedeSchema = z.object({
  matchId: z.string().min(1),
  concedingPlayerId: z.string().min(1),
});
