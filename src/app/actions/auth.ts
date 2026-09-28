"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import type { Locale } from "@/i18n/routing";

/**
 * Server actions auth — client chỉ gửi form data; mọi validate + hash + insert
 * chạy server. Trả về error key (i18n ở client qua messages/auth.json), lỗi
 * NEXT_REDIRECT của signIn thành công phải rethrow (không nuốt).
 */

export type AuthActionState = { error: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseLocale(raw: FormDataEntryValue | null): Locale {
  return raw === "vi" ? "vi" : "en";
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString() ?? "";
  const locale = parseLocale(formData.get("locale"));
  const next = formData.get("next")?.toString();
  const redirectTo = next?.startsWith("/") ? next : `/${locale}`;

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "invalidCredentials" };
    }
    throw error; // NEXT_REDIRECT (đăng nhập thành công)
  }
  return null;
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const displayName = formData.get("displayName")?.toString().trim();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString() ?? "";
  const locale = parseLocale(formData.get("locale"));

  if (!email || !EMAIL_RE.test(email)) return { error: "invalidEmail" };
  if (password.length < 8) return { error: "weakPassword" };

  // profiles.locale = locale của route đăng ký (spec §8 — ACCEPTANCE SF-1)
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [user] = await db
      .insert(users)
      .values({
        name: displayName || null,
        email,
        passwordHash,
      })
      .returning({ id: users.id });

    await db
      .insert(profiles)
      .values({
        id: user.id,
        displayName: displayName || null,
        locale,
      })
      .onConflictDoNothing();
  } catch {
    // users.email unique — race hoặc trùng email
    return { error: "emailTaken" };
  }

  // Tự đăng nhập sau đăng ký
  try {
    await signIn("credentials", { email, password, redirectTo: `/${locale}` });
  } catch (error) {
    if (error instanceof AuthError) return { error: "generic" };
    throw error;
  }
  return null;
}
