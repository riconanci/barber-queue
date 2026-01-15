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

// Accept a client - marks them as called and auto-serves any current called person
export async function acceptClient(clientId: string, barberId: string) {
  await requireStaff();

  // Auto-serve current called person
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

  // Call the new client
  const { error } = await supabase
    .from("queue_entries")
    .update({
      status: "called",
      called_at: new Date().toISOString(),
      called_by_barber_id: barberId,
      skipped_at: null, // Clear skipped if they were in holding
    })
    .eq("id", clientId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// Skip a client - moves them to "Waiting for Barbers" holding area
export async function skipClient(clientId: string) {
  await requireStaff();

  const { error } = await supabase
    .from("queue_entries")
    .update({ skipped_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// Undo skip - puts client back in their original queue position
export async function undoSkip(clientId: string) {
  await requireStaff();

  const { error } = await supabase
    .from("queue_entries")
    .update({ skipped_at: null })
    .eq("id", clientId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// Recall - re-announces the current called person
export async function recall() {
  await requireStaff();

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
  await requireStaff();
  const { error } = await supabase.from("queue_entries").update({ status: "no_show" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function markServed(id: string) {
  await requireStaff();
  const { error } = await supabase
    .from("queue_entries")
    .update({ status: "served", served_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function assignPreferredBarber(id: string, barberId: string | null) {
  await requireStaff();
  const { error } = await supabase.from("queue_entries").update({ preferred_barber_id: barberId }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
