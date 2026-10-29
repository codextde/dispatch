import "server-only"
import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { hashPassword, verifyPassword } from "@/server/crypto"
import { normalizeEmail } from "@/server/auth/magic-link"
import { rateLimit } from "@/server/rate-limit"
import { audit } from "@/server/audit"

export const PASSWORD_MIN_LENGTH = 12

export function passwordHash(password: string) {
  return hashPassword(password)
}

export async function authenticatePassword(input: { email: string; password: string; ip?: string | null; userAgent?: string | null }) {
  const email = normalizeEmail(input.email)
  const ipLimit = await rateLimit(`password-login:ip:${input.ip ?? "unknown"}`, 30, 3600)
  const emailLimit = await rateLimit(`password-login:email:${email}`, 15, 3600)
  if (!ipLimit.ok || !emailLimit.ok) return { ok: false as const, error: "Too many sign-in attempts. Please try again later." }

  const user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` })
  const valid = Boolean(user && user.status === "active" && verifyPassword(input.password, user.passwordHash))
  if (!valid) {
    await audit({ action: "auth.password_login_denied", actorEmail: email, ip: input.ip, userAgent: input.userAgent })
    return { ok: false as const, error: "The email or password is incorrect." }
  }
  return { ok: true as const, userId: user!.id, email: user!.email }
}

export async function setUserPassword(userId: string, password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
  const [user] = await db.update(schema.users).set({ passwordHash: passwordHash(password) }).where(eq(schema.users.id, userId)).returning({ id: schema.users.id })
  if (!user) throw new Error("User not found")
  return user
}
