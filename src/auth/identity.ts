import type { AuthProps } from "./types";

export interface IdentityProfile {
  email?: string;
  emailVerified: boolean;
  username?: string;
  name?: string;
  avatarUrl?: string;
}

interface IdentityRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
}

export async function findOrCreateUserByIdentity(
  db: D1Database,
  provider: string,
  providerUserId: string,
  profile: IdentityProfile,
  now = Date.now(),
): Promise<AuthProps> {
  const existing = await db
    .prepare(
      `SELECT ai.user_id, u.display_name, u.email, ai.username, u.avatar_url
       FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
       WHERE ai.provider = ? AND ai.provider_user_id = ?`,
    )
    .bind(provider, providerUserId)
    .first<IdentityRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE auth_identities
         SET email = ?, email_verified = ?, username = ?, last_login_at = ?
         WHERE provider = ? AND provider_user_id = ?`,
      )
      .bind(
        profile.email ?? null,
        profile.emailVerified ? 1 : 0,
        profile.username ?? null,
        now,
        provider,
        providerUserId,
      )
      .run();
    return rowToProps(existing);
  }

  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const displayName = profile.name ?? profile.username ?? "Self-Deprecation user";
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, display_name, email, avatar_url, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(userId, displayName, profile.email ?? null, profile.avatarUrl ?? null, now, now),
    db
      .prepare(
        `INSERT INTO auth_identities
         (id, user_id, provider, provider_user_id, email, email_verified, username, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        identityId,
        userId,
        provider,
        providerUserId,
        profile.email ?? null,
        profile.emailVerified ? 1 : 0,
        profile.username ?? null,
        now,
        now,
      ),
  ]);

  return {
    userId,
    name: displayName,
    email: profile.email,
    nickname: profile.username,
    avatarUrl: profile.avatarUrl,
  };
}

function rowToProps(row: IdentityRow): AuthProps {
  return {
    userId: row.user_id,
    name: row.display_name ?? row.username ?? "Self-Deprecation user",
    email: row.email ?? undefined,
    nickname: row.username ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
  };
}
