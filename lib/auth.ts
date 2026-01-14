import { cookies } from "next/headers";

const COOKIE = "staff_auth";

export type Role = "staff" | "admin";

export function setAuth(role: Role) {
  cookies().set(COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
}

export function clearAuth() {
  cookies().delete(COOKIE);
}

export function getRole(): Role | null {
  const v = cookies().get(COOKIE)?.value;
  return v === "staff" || v === "admin" ? v : null;
}

export function requireStaff() {
  const role = getRole();
  if (!role) throw new Error("UNAUTHORIZED");
  return role;
}
