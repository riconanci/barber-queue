"use server";

import { setAuth, clearAuth, getRole } from "@/lib/auth";

export async function login(pin: string) {
  if (pin === process.env.ADMIN_PIN) {
    setAuth("admin");
    return { ok: true as const, role: "admin" as const };
  }
  if (pin === process.env.STAFF_PIN) {
    setAuth("staff");
    return { ok: true as const, role: "staff" as const };
  }
  return { ok: false as const };
}

export async function logout() {
  clearAuth();
  return { ok: true as const };
}

export async function getAuthStatus() {
  const role = getRole();
  return { authenticated: !!role, role };
}
