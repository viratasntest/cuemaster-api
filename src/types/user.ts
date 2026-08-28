// Mirrors cuemaster-ui/src/types/user.ts exactly — keep these two files in
// sync by hand until the types move into a shared package (see README.md).

export type UserRole = 'player' | 'club';

export interface BaseUser {
  id: string;
  role: UserRole;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string; // ISO timestamp
}

export interface PlayerProfile extends BaseUser {
  role: 'player';
  /** Unique handle used for friend search/add. */
  username: string;
  bio?: string;
  homeClubId?: string;
}

export interface ClubProfile extends BaseUser {
  role: 'club';
  clubName: string;
  address?: string;
  phone?: string;
}

export type AppUser = PlayerProfile | ClubProfile;

export interface Session {
  user: AppUser;
  /** Signed JWT bearer token. */
  token: string;
  expiresAt: string;
}

export interface PlayerSignupInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

export interface ClubSignupInput {
  email: string;
  password: string;
  clubName: string;
  address?: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  clubName?: string;
  address?: string;
  phone?: string;
}
