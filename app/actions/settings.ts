"use server";

import { requireStaff } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Barber } from "@/lib/types";

export async function updateBarbers(barbers: Barber[]) {
  await requireStaff();
  const { error } = await supabase
    .from("shop_settings")
    .update({ barbers, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updateVisibleCount(visible_count: number) {
  await requireStaff();
  const { error } = await supabase
    .from("shop_settings")
    .update({ visible_count, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
