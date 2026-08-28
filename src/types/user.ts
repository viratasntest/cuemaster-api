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

export type SocialProvider = 'google' | 'facebook';

export interface SocialLoginInput {
  provider: SocialProvider;
  /** Google: an OpenID Connect id_token. Facebook: a Graph API access_token.
   * Verified server-side — see docs/BACKEND.md's Social Login section. */
  token: string;
  /** Only used if this is the first time this provider identity is seen and a
   * new account needs to be created; ignored if one already exists. */
  role: UserRole;
}

// Note: cuemaster-ui's mirror of this file also has an `AvatarUpload`
// interface (`{ uri, fileName, mimeType }`) — that's the on-device "picked
// file, ready to upload" shape its client code builds a FormData from. There's
// nothing to mirror server-side: this API receives avatar uploads as an
// actual multipart file (`Express.Multer.File`, see routes/users.ts), not
// that TS shape.

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
