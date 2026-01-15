"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { QueueEntry, ShopSettings, Barber } from "@/lib/types";
import { displayName } from "@/lib/types";
import { login, logout } from "@/app/actions/auth";
import { staffNext, recall, markNoShow, assignPreferredBarber } from "@/app/actions/queue";

export default function StaffPage() {
  const router = useRouter();
  const [role, setRole] = useState<"staff" | "admin" | null>(null);
  const [pin, setPin] = useState("");

  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);

  const [myBarberId, setMyBarberId] = useState<string>("");
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

  useEffect(() => {
    if (!myBarberId && workingBarbers.length) setMyBarberId(workingBarbers[0].id);
  }, [workingBarbers, myBarberId]);

  const called = useMemo(() => {
    const calledOnes = entries.filter((e) => e.status === "called");
    calledOnes.sort((a, b) => +new Date(b.called_at ?? 0) - +new Date(a.called_at ?? 0));
    return calledOnes[0] ?? null;
  }, [entries]);

  const waiting = useMemo(() => entries.filter((e) => e.status === "waiting"), [entries]);

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
      <style>{`
        @keyframes softFlashDark {
          0% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
          45% { transform: scale(1.01); box-shadow: 0 16px 44px rgba(0,0,0,0.48); }
          100% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
        }
      `}</style>

      <header style={styles.topBar}>
        <div style={styles.topBarTitle}>Staff Controls</div>
        <div style={styles.topBarActions}>
          <button onClick={() => router.push("/settings")} style={styles.ghostBtn}>
            Settings
          </button>
          <button onClick={doLock} style={styles.ghostBtn}>
            Lock
          </button>
        </div>
      </header>

      <div style={styles.grid}>
        {/* CONTROLS */}
        <section style={styles.card}>
          <div style={styles.sectionLabel}>Controls</div>

          <div style={styles.rowStack}>
            <label style={styles.smallLabel}>I'm</label>
            <select
              value={myBarberId}
              onChange={(e) => setMyBarberId(e.target.value)}
              style={styles.select}
            >
              {workingBarbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <div style={styles.btnRow}>
              <button
                onClick={() => run(() => staffNext(myBarberId))}
                style={styles.primaryBtn}
                disabled={busy}
              >
                Next for me
              </button>

              <button onClick={() => run(() => recall())} style={styles.secondaryBtn} disabled={busy}>
                Recall
              </button>
            </div>

            <div style={styles.nowUpBox}>
              <div style={styles.smallLabel}>Now Up</div>
              <div style={styles.nowUpName}>{called ? displayName(called) : "—"}</div>
            </div>
          </div>
        </section>

        {/* WAITING LIST */}
        <section style={styles.card}>
          <div style={styles.sectionLabel}>
            Waiting <span style={styles.waitingCount}>({waiting.length})</span>
          </div>

          {waiting.length === 0 ? (
            <div style={styles.empty}>No one waiting.</div>
          ) : (
            <div style={styles.waitingList}>
              {waiting.slice(0, 30).map((e) => (
                <WaitingRow
                  key={e.id}
                  e={e}
                  settings={settings}
                  workingBarbers={workingBarbers}
                  busy={busy}
                  onNoShow={() => run(() => markNoShow(e.id))}
                  onAssign={(barberIdOrNull) => run(() => assignPreferredBarber(e.id, barberIdOrNull))}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WaitingRow({
  e,
  settings,
  workingBarbers,
  busy,
  onNoShow,
  onAssign,
}: {
  e: QueueEntry;
  settings: ShopSettings | null;
  workingBarbers: Barber[];
  busy: boolean;
  onNoShow: () => void;
  onAssign: (barberIdOrNull: string | null) => void;
}) {
  const currentLabel = e.preferred_barber_id
    ? settings?.barbers.find((b) => b.id === e.preferred_barber_id)?.name ?? e.preferred_barber_id
    : "Any barber";

  return (
    <div style={styles.waitingRow}>
      <div style={styles.waitingTop}>
        <div style={styles.waitingName}>{displayName(e)}</div>
        <div style={styles.waitingMeta}>{currentLabel}</div>
      </div>

      <div style={styles.waitingActions}>
        <select
          value={e.preferred_barber_id ?? ""}
          onChange={(ev) => onAssign(ev.target.value ? ev.target.value : null)}
          style={styles.selectSmall}
          disabled={busy}
        >
          <option value="">Any barber</option>
          {workingBarbers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <button onClick={onNoShow} style={styles.dangerBtn} disabled={busy}>
          No-show
        </button>
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
    maxWidth: 980,
    margin: "0 auto 14px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
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

  grid: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr",
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

  sectionLabel: {
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 15px)",
    opacity: 0.75,
    marginBottom: 10,
  },

  waitingCount: {
    opacity: 0.6,
    fontWeight: 800,
  },

  rowStack: {
    display: "grid",
    gap: 10,
  },

  smallLabel: {
    fontWeight: 850,
    opacity: 0.75,
    fontSize: "clamp(12px, 2.2vw, 14px)",
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

  select: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(0,0,0,0.20)",
    color: "#f9fafb",
    fontSize: "clamp(16px, 3.6vw, 18px)",
    fontWeight: 850,
  },

  selectSmall: {
    flex: 1,
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(0,0,0,0.20)",
    color: "#f9fafb",
    fontSize: "clamp(14px, 3.2vw, 16px)",
    fontWeight: 850,
  },

  btnRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 6,
  },

  primaryBtn: {
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

  secondaryBtn: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(148, 163, 184, 0.18)",
    color: "#f9fafb",
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

  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(248, 113, 113, 0.22)",
    background: "rgba(248, 113, 113, 0.12)",
    color: "rgba(254, 226, 226, 0.95)",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  nowUpBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
  },

  nowUpName: {
    marginTop: 6,
    fontSize: "clamp(18px, 4.6vw, 28px)",
    fontWeight: 950,
    color: "#f9fafb",
  },

  waitingList: {
    display: "grid",
    gap: 10,
  },

  waitingRow: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
  },

  waitingTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "baseline",
    flexWrap: "wrap",
  },

  waitingName: {
    fontWeight: 950,
    color: "#f9fafb",
    fontSize: "clamp(16px, 3.8vw, 20px)",
  },

  waitingMeta: {
    fontWeight: 850,
    opacity: 0.65,
    fontSize: "clamp(12px, 2.8vw, 14px)",
  },

  waitingActions: {
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  empty: {
    textAlign: "center",
    opacity: 0.7,
    fontWeight: 850,
    padding: 10,
  },

  note: {
    marginTop: 12,
    textAlign: "center",
    opacity: 0.6,
    fontWeight: 800,
    fontSize: "clamp(12px, 2.2vw, 14px)",
  },
};
