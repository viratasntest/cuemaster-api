import { env } from '../config/env';
import { ApiError } from './errors';

export type SocialProvider = 'google' | 'facebook';

export interface SocialProfile {
  providerId: string;
  email: string | null;
  name: string;
  avatarUrl?: string;
}

/**
 * Server-side token verification for POST /auth/social/:provider — see
 * docs/BACKEND.md's Social Login section. The client only ever sends a
 * provider token it obtained via OAuth; this is what makes that
 * trustworthy — never take the client's own claim of who it is.
 *
 * Google: uses the "Simpler" option the doc lists (one extra network
 * round-trip to `tokeninfo`, which validates the id_token's signature and
 * expiry itself and hands back its claims) rather than verifying the JWT
 * locally against Google's JWKS — the doc calls out this is "fine at this
 * scale" and it's exactly what the mock does client-side for dev. Swap to
 * `google-auth-library`'s `OAuth2Client.verifyIdToken` (the doc's
 * "Preferred" option) if you want offline verification without the extra
 * round-trip.
 */
export async function verifySocialToken(provider: SocialProvider, token: string): Promise<SocialProfile> {
  return provider === 'google' ? verifyGoogleToken(token) : verifyFacebookToken(token);
}

async function verifyGoogleToken(idToken: string): Promise<SocialProfile> {
  if (env.googleClientIds.length === 0) {
    throw ApiError.badRequest('Google sign-in is not configured on this server (GOOGLE_CLIENT_IDS unset).');
  }

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw ApiError.unauthorized('Could not verify Google sign-in.');
  const data = (await res.json()) as Record<string, string>;

  // tokeninfo already validates signature + expiry to return 200 at all, but
  // check both explicitly anyway — defense in depth, and it's what catches a
  // token minted for a *different* Google client id being replayed here.
  if (!data.aud || !env.googleClientIds.includes(data.aud)) {
    throw ApiError.unauthorized('This Google sign-in was not issued for this app.');
  }
  if (!data.exp || Number(data.exp) * 1000 < Date.now()) {
    throw ApiError.unauthorized('This Google sign-in has expired.');
  }
  if (!data.sub) throw ApiError.unauthorized('Could not verify Google sign-in.');

  return { providerId: data.sub, email: data.email ?? null, name: data.name ?? data.email ?? 'Google user', avatarUrl: data.picture };
}

async function verifyFacebookToken(accessToken: string): Promise<SocialProfile> {
  if (!env.facebookAppId || !env.facebookAppSecret) {
    throw ApiError.badRequest('Facebook sign-in is not configured on this server (FACEBOOK_APP_ID/FACEBOOK_APP_SECRET unset).');
  }

  const appToken = `${env.facebookAppId}|${env.facebookAppSecret}`;
  const debugRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
  );
  if (!debugRes.ok) throw ApiError.unauthorized('Could not verify Facebook sign-in.');
  const debug = (await debugRes.json()) as { data?: { is_valid?: boolean; app_id?: string } };

  // This is what stops a token minted for a *different* Facebook app being
  // replayed against ours.
  if (!debug.data?.is_valid || debug.data.app_id !== env.facebookAppId) {
    throw ApiError.unauthorized('This Facebook sign-in was not issued for this app.');
  }

  const fields = 'id,name,email,picture.type(large)';
  const profileRes = await fetch(`https://graph.facebook.com/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`);
  if (!profileRes.ok) throw ApiError.unauthorized('Could not verify Facebook sign-in.');
  const profile = (await profileRes.json()) as {
    id?: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  if (!profile.id) throw ApiError.unauthorized('Could not verify Facebook sign-in.');

  return {
    providerId: profile.id,
    email: profile.email ?? null,
    name: profile.name ?? 'Facebook user',
    avatarUrl: profile.picture?.data?.url,
  };
}
