"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { QueueEntry, ShopSettings } from "@/lib/types";
import { displayName } from "@/lib/types";
import { login, logout } from "@/app/actions/auth";
import { acceptClient, skipClient, undoSkip, recall, markNoShow } from "@/app/actions/queue";

export default function StaffPage() {
  const router = useRouter();
  const [role, setRole] = useState<"staff" | "admin" | null>(null);
  const [pin, setPin] = useState("");

  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await supabase.from("shop_settings").select("*").eq("id", true).single();
      setSettings((s.data ?? null) as ShopSettings | null);

      const q = await supabase
        .from("queue_entries")
        .select("*")
        .in("status", ["waiting", "called"])
        .order("created_at", { ascending: true });

      setEntries((q.data ?? []) as QueueEntry[]);
    })();

    const qch = supabase
      .channel("queue_staff")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, async () => {
        const q = await supabase
          .from("queue_entries")
          .select("*")
          .in("status", ["waiting", "called"])
          .order("created_at", { ascending: true });
        setEntries((q.data ?? []) as QueueEntry[]);
      })
      .subscribe();

    const sch = supabase
      .channel("settings_staff")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_settings" }, (payload) => {
        setSettings(payload.new as ShopSettings);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(qch);
      supabase.removeChannel(sch);
    };
  }, []);

  const workingBarbers = useMemo(
    () => (settings?.barbers ?? []).filter((b) => b.working),
    [settings]
  );

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    (settings?.barbers ?? []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [settings]);

  // Currently called person
  const called = useMemo(() => {
    const calledOnes = entries.filter((e) => e.status === "called");
    calledOnes.sort((a, b) => +new Date(b.called_at ?? 0) - +new Date(a.called_at ?? 0));
    return calledOnes[0] ?? null;
  }, [entries]);

  // Waiting entries
  const waiting = useMemo(() => entries.filter((e) => e.status === "waiting"), [entries]);

  // Up Next: first non-skipped waiting client
  const upNext = useMemo(() => {
    const nonSkipped = waiting
      .filter((e) => !e.skipped_at)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    return nonSkipped[0] ?? null;
  }, [waiting]);

  // Waiting for Barbers: skipped clients grouped by barber
  const waitingForBarbers = useMemo(() => {
    const skipped = waiting
      .filter((e) => !!e.skipped_at && !!e.preferred_barber_id)
      .sort((a, b) => +new Date(a.skipped_at!) - +new Date(b.skipped_at!));

    // Group by barber
    const grouped = new Map<string, QueueEntry[]>();
    skipped.forEach((e) => {
      const bid = e.preferred_barber_id!;
      if (!grouped.has(bid)) grouped.set(bid, []);
      grouped.get(bid)!.push(e);
    });

    return grouped;
  }, [waiting]);

  // Queue: remaining non-skipped waiting clients (excluding upNext)
  const queue = useMemo(() => {
    const nonSkipped = waiting
      .filter((e) => !e.skipped_at)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    return nonSkipped.slice(1); // Exclude first one (upNext)
  }, [waiting]);

  async function doLogin() {
    const res = await login(pin);
    if (!res.ok) {
      alert("Wrong PIN");
      setPin("");
      return;
    }
    setRole(res.role);
    setPin("");
  }

  async function doLock() {
    await logout();
    setRole(null);
  }

  async function run(action: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await action();
      if (res && res.ok === false) alert(res.error ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  // Time ago helper
  function timeAgo(dateStr: string) {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min";
    return `${mins} min`;
  }

  if (!role) {
    return (
      <div style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.header}>
            <div style={styles.title}>Staff</div>
            <div style={styles.subtitle}>Enter PIN to unlock</div>
          </div>

          <div style={styles.card}>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              inputMode="numeric"
              style={styles.input}
              onKeyDown={(e) => e.key === "Enter" && doLogin()}
            />
            <button onClick={doLogin} style={styles.primaryBtn}>
              Unlock
            </button>

            <div style={styles.note}>
              Tip: save this page to your home screen for fast access.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <div style={styles.topBarTitle}>Staff Controls</div>
        <div style={styles.topBarActions}>
          <button onClick={() => run(() => recall())} style={styles.ghostBtn} disabled={busy}>
            Recall
          </button>
          <button onClick={() => router.push("/settings")} style={styles.ghostBtn}>
            Settings
          </button>
          <button onClick={doLock} style={styles.ghostBtn}>
            Lock
          </button>
        </div>
      </header>

      <div style={styles.container}>
        {/* UP NEXT CARD */}
        <section style={styles.upNextCard}>
          <div style={styles.sectionLabel}>UP NEXT</div>

          {called ? (
            <div style={styles.calledInfo}>
              <div style={styles.calledName}>{displayName(called)}</div>
              <div style={styles.calledMeta}>
                with {nameMap.get(called.called_by_barber_id ?? "") ?? called.called_by_barber_id}
              </div>
            </div>
          ) : upNext ? (
            <>
              <div style={styles.upNextInfo}>
                <div style={styles.upNextName}>{displayName(upNext)}</div>
                <div style={styles.upNextMeta}>
                  {upNext.preferred_barber_id
                    ? `for ${nameMap.get(upNext.preferred_barber_id) ?? upNext.preferred_barber_id}`
                    : "Any barber"}
                </div>
              </div>

              <div style={styles.upNextActions}>
                {upNext.preferred_barber_id ? (
                  // Specific barber - show Accept as [Barber] and Skip
                  <>
                    <button
                      onClick={() => run(() => acceptClient(upNext.id, upNext.preferred_barber_id!))}
                      style={styles.acceptBtn}
                      disabled={busy}
                    >
                      Accept as {nameMap.get(upNext.preferred_barber_id) ?? upNext.preferred_barber_id}
                    </button>
                    <button
                      onClick={() => run(() => skipClient(upNext.id))}
                      style={styles.skipBtn}
                      disabled={busy}
                    >
                      Skip
                    </button>
                  </>
                ) : (
                  // Any barber - show dropdown
                  <div style={styles.acceptRow}>
                    <select
                      id="barberSelect"
                      style={styles.barberSelect}
                      defaultValue=""
                    >
                      <option value="" disabled>Accept as...</option>
                      {workingBarbers.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById("barberSelect") as HTMLSelectElement;
                        if (select.value) {
                          run(() => acceptClient(upNext.id, select.value));
                        }
                      }}
                      style={styles.acceptBtn}
                      disabled={busy}
                    >
                      Accept
                    </button>
                  </div>
                )}
                <button
                  onClick={() => run(() => markNoShow(upNext.id))}
                  style={styles.noShowBtn}
                  disabled={busy}
                >
                  ✕
                </button>
              </div>
            </>
          ) : (
            <div style={styles.empty}>No one in queue</div>
          )}
        </section>

        {/* WAITING FOR BARBERS */}
        {waitingForBarbers.size > 0 && (
          <section style={styles.card}>
            <div style={styles.sectionLabel}>Waiting for Barbers</div>

            <div style={styles.barberGroups}>
              {Array.from(waitingForBarbers.entries()).map(([barberId, clients]) => (
                <div key={barberId} style={styles.barberGroup}>
                  <div style={styles.barberGroupHeader}>
                    {nameMap.get(barberId) ?? barberId}
                    <span style={styles.barberGroupCount}>({clients.length})</span>
                  </div>

                  {clients.map((e) => (
                    <div key={e.id} style={styles.waiterRow}>
                      <div style={styles.waiterInfo}>
                        <span style={styles.waiterName}>{displayName(e)}</span>
                        <span style={styles.waiterTime}>{timeAgo(e.skipped_at!)}</span>
                      </div>
                      <div style={styles.waiterActions}>
                        <button
                          onClick={() => run(() => acceptClient(e.id, barberId))}
                          style={styles.smallAcceptBtn}
                          disabled={busy}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => run(() => undoSkip(e.id))}
                          style={styles.smallUndoBtn}
                          disabled={busy}
                        >
                          ↩
                        </button>
                        <button
                          onClick={() => run(() => markNoShow(e.id))}
                          style={styles.smallNoShowBtn}
                          disabled={busy}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* QUEUE */}
        <section style={styles.card}>
          <div style={styles.sectionLabel}>
            Queue <span style={styles.queueCount}>({queue.length})</span>
          </div>

          {queue.length === 0 ? (
            <div style={styles.empty}>Queue is empty</div>
          ) : (
            <div style={styles.queueList}>
              {queue.slice(0, 20).map((e) => (
                <div key={e.id} style={styles.queueRow}>
                  <div style={styles.queueInfo}>
                    <span style={styles.queueName}>{displayName(e)}</span>
                    <span style={styles.queueMeta}>
                      {e.preferred_barber_id
                        ? `for ${nameMap.get(e.preferred_barber_id) ?? e.preferred_barber_id}`
                        : "Any barber"}
                    </span>
                  </div>
                  <button
                    onClick={() => run(() => markNoShow(e.id))}
                    style={styles.smallNoShowBtn}
                    disabled={busy}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "clamp(14px, 3vw, 26px)",
    fontFamily: "system-ui",
    color: "#e5e7eb",
    background:
      "radial-gradient(1000px 700px at 20% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0) 60%)," +
      "linear-gradient(180deg, #0b0f16 0%, #0a0e14 50%, #070a10 100%)",
  },

  centerWrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
  },

  header: {
    width: "min(720px, 100%)",
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: "clamp(28px, 6vw, 44px)",
    fontWeight: 950,
    color: "#f9fafb",
  },
  subtitle: {
    marginTop: 6,
    opacity: 0.7,
    fontWeight: 850,
  },

  topBar: {
    maxWidth: 600,
    margin: "0 auto 14px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  topBarTitle: {
    fontSize: "clamp(18px, 3.5vw, 24px)",
    fontWeight: 950,
    color: "#f9fafb",
  },
  topBarActions: {
    display: "flex",
    gap: 8,
  },

  container: {
    maxWidth: 600,
    margin: "0 auto",
    display: "grid",
    gap: 14,
  },

  card: {
    borderRadius: 18,
    background: "rgba(17, 24, 39, 0.70)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    padding: "clamp(14px, 3vw, 22px)",
    backdropFilter: "blur(10px)",
  },

  upNextCard: {
    borderRadius: 18,
    background: "rgba(17, 24, 39, 0.80)",
    border: "1px solid rgba(148, 163, 184, 0.15)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    padding: "clamp(16px, 3vw, 24px)",
    backdropFilter: "blur(10px)",
  },

  sectionLabel: {
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 15px)",
    opacity: 0.75,
    marginBottom: 12,
  },

  calledInfo: {
    textAlign: "center",
    padding: "8px 0",
  },
  calledName: {
    fontSize: "clamp(24px, 5vw, 36px)",
    fontWeight: 950,
    color: "#f9fafb",
  },
  calledMeta: {
    marginTop: 4,
    fontSize: "clamp(14px, 3vw, 18px)",
    fontWeight: 800,
    opacity: 0.7,
  },

  upNextInfo: {
    textAlign: "center",
    marginBottom: 16,
  },
  upNextName: {
    fontSize: "clamp(24px, 5vw, 36px)",
    fontWeight: 950,
    color: "#f9fafb",
  },
  upNextMeta: {
    marginTop: 4,
    fontSize: "clamp(14px, 3vw, 18px)",
    fontWeight: 800,
    opacity: 0.7,
  },

  upNextActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  acceptRow: {
    display: "flex",
    gap: 8,
    flex: 1,
  },

  barberSelect: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(0,0,0,0.20)",
    color: "#f9fafb",
    fontSize: "clamp(14px, 3vw, 16px)",
    fontWeight: 850,
  },

  acceptBtn: {
    padding: "12px 20px",
    borderRadius: 12,
    border: "1px solid rgba(74, 222, 128, 0.25)",
    background: "rgba(74, 222, 128, 0.15)",
    color: "rgba(187, 247, 208, 0.95)",
    fontSize: "clamp(14px, 3vw, 16px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  skipBtn: {
    padding: "12px 20px",
    borderRadius: 12,
    border: "1px solid rgba(251, 191, 36, 0.25)",
    background: "rgba(251, 191, 36, 0.15)",
    color: "rgba(254, 240, 138, 0.95)",
    fontSize: "clamp(14px, 3vw, 16px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  noShowBtn: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(248, 113, 113, 0.22)",
    background: "rgba(248, 113, 113, 0.12)",
    color: "rgba(254, 226, 226, 0.95)",
    fontSize: "clamp(14px, 3vw, 16px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  barberGroups: {
    display: "grid",
    gap: 12,
  },

  barberGroup: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
  },

  barberGroupHeader: {
    fontWeight: 950,
    fontSize: "clamp(14px, 3vw, 18px)",
    color: "#f9fafb",
    marginBottom: 10,
  },

  barberGroupCount: {
    opacity: 0.6,
    fontWeight: 800,
    marginLeft: 6,
  },

  waiterRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },

  waiterInfo: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
  },

  waiterName: {
    fontWeight: 900,
    fontSize: "clamp(14px, 3vw, 16px)",
    color: "#f9fafb",
  },

  waiterTime: {
    fontWeight: 800,
    fontSize: "clamp(12px, 2.5vw, 14px)",
    opacity: 0.6,
  },

  waiterActions: {
    display: "flex",
    gap: 6,
  },

  smallAcceptBtn: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(74, 222, 128, 0.25)",
    background: "rgba(74, 222, 128, 0.15)",
    color: "rgba(187, 247, 208, 0.95)",
    fontSize: "clamp(12px, 2.5vw, 14px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  smallUndoBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(148, 163, 184, 0.20)",
    background: "rgba(148, 163, 184, 0.12)",
    color: "rgba(203, 213, 225, 0.95)",
    fontSize: "clamp(12px, 2.5vw, 14px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  smallNoShowBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(248, 113, 113, 0.22)",
    background: "rgba(248, 113, 113, 0.12)",
    color: "rgba(254, 226, 226, 0.95)",
    fontSize: "clamp(12px, 2.5vw, 14px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  queueCount: {
    opacity: 0.6,
    fontWeight: 800,
  },

  queueList: {
    display: "grid",
    gap: 8,
  },

  queueRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.12)",
  },

  queueInfo: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
  },

  queueName: {
    fontWeight: 900,
    fontSize: "clamp(14px, 3vw, 16px)",
    color: "#f9fafb",
  },

  queueMeta: {
    fontWeight: 800,
    fontSize: "clamp(12px, 2.5vw, 14px)",
    opacity: 0.6,
  },

  empty: {
    textAlign: "center",
    opacity: 0.7,
    fontWeight: 850,
    padding: 10,
  },

  input: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(0,0,0,0.20)",
    color: "#f9fafb",
    fontSize: "clamp(18px, 4.2vw, 22px)",
    fontWeight: 850,
  },

  primaryBtn: {
    marginTop: 12,
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(229,231,235,0.92)",
    color: "#0b0f16",
    fontSize: "clamp(16px, 3.6vw, 18px)",
    fontWeight: 950,
    cursor: "pointer",
  },

  ghostBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(249,250,251,0.88)",
    fontWeight: 900,
    cursor: "pointer",
  },

  note: {
    marginTop: 12,
    textAlign: "center",
    opacity: 0.6,
    fontWeight: 800,
    fontSize: "clamp(12px, 2.2vw, 14px)",
  },
};
