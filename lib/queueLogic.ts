import { QueueEntry, ShopSettings } from "./types";

export function computeDisplaySegments(entries: QueueEntry[], settings: ShopSettings) {
  // Only look at waiting entries (not called/served/no_show)
  const waiting = entries.filter((e) => e.status === "waiting");

  const workingBarbers = settings.barbers.filter((b) => b.working);
  const N = workingBarbers.length || settings.barber_count || 1;

  // Skipped waiters: specific barber + have been skipped
  // These appear ABOVE the "On Deck" section
  const skippedWaiters = waiting
    .filter((e) => !!e.preferred_barber_id && !!e.skipped_at)
    .sort((a, b) => +new Date(a.skipped_at!) - +new Date(b.skipped_at!));

  // Active queue: everyone NOT skipped (both any-barber and specific-barber who haven't been skipped yet)
  const activeQueue = waiting
    .filter((e) => !e.skipped_at)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  // For "On Deck" sizing, count how many barbers have skipped waiters
  const barbersWithWaiters = new Set(skippedWaiters.map((w) => w.preferred_barber_id!)).size;
  const onDeckSize = Math.max(0, N - barbersWithWaiters);

  const visibleCount = settings.visible_count ?? 10;

  // On Deck: first onDeckSize from activeQueue
  const onDeck = activeQueue.slice(0, onDeckSize);

  // Remaining: rest of activeQueue up to visibleCount
  const remainingCount = Math.max(0, visibleCount - onDeck.length - skippedWaiters.length);
  const remaining = activeQueue.slice(onDeckSize, onDeckSize + remainingCount);

  return { 
    skippedWaiters,  // Above On Deck (waiting for specific barber)
    onDeck,          // Highlighted "On Deck" section
    remaining,       // Below On Deck
    onDeckSize,
    visibleCount,
    N 
  };
}

export function barberNameMap(settings: ShopSettings) {
  const m = new Map<string, string>();
  settings.barbers.forEach((b) => m.set(b.id, b.name));
  return m;
}
