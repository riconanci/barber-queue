import { cookies } from "next/headers";

const COOKIE = "staff_auth";

export type Role = "staff" | "admin";

export async function setAuth(role: Role) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
}

export async function clearAuth() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

export async function getRole(): Promise<Role | null> {
  const cookieStore = await cookies();
  const v = cookieStore.get(COOKIE)?.value;
  return v === "staff" || v === "admin" ? v : null;
}

export async function requireStaff(): Promise<Role> {
  const role = await getRole();
  if (!role) throw new Error("UNAUTHORIZED");
  return role;
}
