import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { UserRole, UserStatus } from "@prisma/client";

const SESSION_COOKIE_NAME = "meal_session";
const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "office-meal-management-super-secret-key-change-in-prod"
);

export interface SessionPayload {
  userId: string;
  role: UserRole;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (!payload.userId || !payload.role || !payload.email) {
      return null;
    }
    return {
      userId: String(payload.userId),
      role: payload.role as UserRole,
      email: String(payload.email),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      mealPreference: true,
      defaultMealQty: true,
      mealStartDate: true,
      joinedAt: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return null;
  }

  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Unauthorized. Please sign in.", 401);
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== UserRole.ADMIN) {
    throw new AuthError("Forbidden. Admin access required.", 403);
  }
  return user;
}
