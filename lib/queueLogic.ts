import { QueueEntry, ShopSettings } from "./types";

export function computeDisplaySegments(entries: QueueEntry[], settings: ShopSettings) {
  const waiting = entries.filter((e) => e.status === "waiting");

  const workingBarbers = settings.barbers.filter((b) => b.working);
  const N = workingBarbers.length || settings.barber_count || 1;

  const waiters = waiting
    .filter((e) => !!e.preferred_barber_id)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const anyBarber = waiting
    .filter((e) => !e.preferred_barber_id)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const waiterBarberSet = new Set(waiters.map((w) => w.preferred_barber_id!).filter(Boolean));
  const W = waiterBarberSet.size;

  const upNextSize = Math.max(0, N - W);
  const visibleCount = settings.visible_count ?? 10;

  const upNext = anyBarber.slice(0, upNextSize);

  const onDeckCount = Math.max(0, visibleCount - upNext.length);
  const onDeck = anyBarber.slice(upNext.length, upNext.length + onDeckCount);

  return { waiters, upNext, onDeck, N, W, upNextSize, visibleCount };
}

export function barberNameMap(settings: ShopSettings) {
  const m = new Map<string, string>();
  settings.barbers.forEach((b) => m.set(b.id, b.name));
  return m;
}
