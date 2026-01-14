"use server";

import { requireStaff } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

function normalizeInitial(s: string) {
  const t = (s || "").trim().toUpperCase();
  return t.slice(0, 1);
}

export async function addClient(firstName: string, lastInitial: string, preferredBarberId: string | null) {
  const first_name = (firstName || "").trim();
  const last_initial = normalizeInitial(lastInitial);

  if (!first_name || !last_initial) return { ok: false as const, error: "Missing name" };

  const { error } = await supabase.from("queue_entries").insert({
    first_name,
    last_initial,
    preferred_barber_id: preferredBarberId || null,
    status: "waiting",
  });

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function staffNext(myBarberId: string) {
  requireStaff();

  const waiter = await supabase
    .from("queue_entries")
    .select("*")
    .eq("status", "waiting")
    .eq("preferred_barber_id", myBarberId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const any = await supabase
    .from("queue_entries")
    .select("*")
    .eq("status", "waiting")
    .is("preferred_barber_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const next = waiter.data ?? any.data;
  if (!next) return { ok: false as const, error: "No one waiting" };

  const currentCalled = await supabase
    .from("queue_entries")
    .select("*")
    .eq("status", "called")
    .order("called_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentCalled.data) {
    await supabase
      .from("queue_entries")
      .update({ status: "served", served_at: new Date().toISOString() })
      .eq("id", currentCalled.data.id);
  }

  const { error } = await supabase
    .from("queue_entries")
    .update({
      status: "called",
      called_at: new Date().toISOString(),
      called_by_barber_id: myBarberId,
    })
    .eq("id", next.id);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, calledId: next.id };
}

export async function recall() {
  requireStaff();

  const currentCalled = await supabase
    .from("queue_entries")
    .select("*")
    .eq("status", "called")
    .order("called_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentCalled.data) return { ok: false as const, error: "No one currently called" };

  const { error } = await supabase
    .from("queue_entries")
    .update({ called_at: new Date().toISOString() })
    .eq("id", currentCalled.data.id);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function markNoShow(id: string) {
  requireStaff();
  const { error } = await supabase.from("queue_entries").update({ status: "no_show" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function assignPreferredBarber(id: string, barberId: string | null) {
  requireStaff();
  const { error } = await supabase.from("queue_entries").update({ preferred_barber_id: barberId }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
