"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { QueueEntry, ShopSettings } from "@/lib/types";
import { displayName } from "@/lib/types";
import { barberNameMap, computeDisplaySegments } from "@/lib/queueLogic";

export default function DisplayPage() {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Flash NOW UP on Next/Recall (called_at changes)
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const s = await supabase.from("shop_settings").select("*").eq("id", true).single();
      const q = await supabase
        .from("queue_entries")
        .select("*")
        .in("status", ["waiting", "called"])
        .order("created_at", { ascending: true });

      if (!mounted) return;
      setSettings((s.data ?? null) as ShopSettings | null);
      setEntries(((q.data ?? []) as QueueEntry[]) ?? []);
      setLoading(false);
    }

    load();

    const queueCh = supabase
      .channel("queue_display")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, async () => {
        const q = await supabase
          .from("queue_entries")
          .select("*")
          .in("status", ["waiting", "called"])
          .order("created_at", { ascending: true });
        setEntries(((q.data ?? []) as QueueEntry[]) ?? []);
      })
      .subscribe();

    const settingsCh = supabase
      .channel("settings_display")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_settings" }, (payload) => {
        setSettings(payload.new as ShopSettings);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(queueCh);
      supabase.removeChannel(settingsCh);
    };
  }, []);

  const called = useMemo(() => {
    const calledOnes = entries.filter((e) => e.status === "called");
    calledOnes.sort((a, b) => +new Date(b.called_at ?? 0) - +new Date(a.called_at ?? 0));
    return calledOnes[0] ?? null;
  }, [entries]);

  useEffect(() => {
    if (!called?.called_at) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 650);
    return () => clearTimeout(t);
  }, [called?.called_at]);

  if (loading || !settings) {
    return <div style={{ padding: 24, fontFamily: "system-ui", color: "#e5e7eb" }}>Loading…</div>;
  }

  const seg = computeDisplaySegments(entries, settings);
  const nameMap = barberNameMap(settings);

  const calledBy =
    called?.called_by_barber_id
      ? nameMap.get(called.called_by_barber_id) ?? called.called_by_barber_id
      : null;

  const hasAnyList = seg.waiters.length > 0 || seg.upNext.length > 0 || seg.onDeck.length > 0;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes softFlashDark {
          0% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
          45% { transform: scale(1.01); box-shadow: 0 16px 44px rgba(0,0,0,0.48); }
          100% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
        }
      `}</style>

      {/* NOW UP */}
      <section style={{ ...styles.nowUpCard, ...(flash ? styles.nowUpFlash : {}) }}>
        <div style={styles.sectionLabel}>NOW UP</div>
        <div style={styles.nowUpName}>{called ? displayName(called) : "—"}</div>
        <div style={styles.nowUpSub}>{calledBy ? `with ${calledBy}` : "\u00A0"}</div>
      </section>

      {/* LIST */}
      <section style={styles.listCard}>
        <header style={styles.listHeader}>
          <div style={styles.sectionLabel}>LIST</div>
          <div style={styles.headerMeta}>
            <span>
              Up Next: <b style={styles.headerStrong}>{seg.upNextSize}</b>
            </span>
            <span style={styles.dot}>•</span>
            <span>
              Showing: <b style={styles.headerStrong}>{seg.visibleCount}</b>
            </span>
          </div>
        </header>

        {!hasAnyList ? (
          <div style={styles.emptyState}>No one in line</div>
        ) : (
          <div style={styles.listBody}>
            {/* WAITERS ABOVE HIGHLIGHT */}
            {seg.waiters.map((e) => {
              const barberLabel = e.preferred_barber_id
                ? nameMap.get(e.preferred_barber_id) ?? e.preferred_barber_id
                : null;

              return (
                <div key={e.id} style={styles.row}>
                  <div style={styles.rowMain}>
                    <div style={styles.rowName}>{displayName(e)}</div>
                    <div style={styles.rowMeta}>{barberLabel ? `waiting on ${barberLabel}` : ""}</div>
                  </div>
                </div>
              );
            })}

            {/* UP NEXT WINDOW */}
            <div style={styles.upNextWindow}>
              <div style={styles.upNextHeader}>
                <div style={styles.upNextTitle}>
                  UP NEXT <span style={{ opacity: 0.6 }}>({seg.upNextSize})</span>
                </div>
              </div>

              {seg.upNext.length === 0 ? (
                <div style={styles.emptyRow}>—</div>
              ) : (
                seg.upNext.map((e) => (
                  <div key={e.id} style={{ ...styles.row, ...styles.upNextRow }}>
                    <div style={styles.rowMain}>
                      <div style={styles.rowName}>{displayName(e)}</div>
                      <div style={styles.rowMeta}>up next</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* REMAINING NAMES BELOW (NO LABEL) */}
            {seg.onDeck.map((e) => (
              <div key={e.id} style={styles.row}>
                <div style={styles.rowMain}>
                  <div style={styles.rowName}>{displayName(e)}</div>
                  <div style={styles.rowMeta} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={styles.footer}>Walk-ins • Please be ready when your name is called</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "clamp(14px, 3vw, 28px)",
    fontFamily: "system-ui",
    display: "flex",
    flexDirection: "column",
    gap: "clamp(14px, 3vw, 24px)",
    maxWidth: 860,
    margin: "0 auto",
    color: "#e5e7eb",
    background:
      "radial-gradient(1000px 700px at 20% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0) 60%)," +
      "linear-gradient(180deg, #0b0f16 0%, #0a0e14 50%, #070a10 100%)",
  },

  sectionLabel: {
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 16px)",
    opacity: 0.75,
    color: "rgba(229,231,235,0.78)",
  },

  nowUpCard: {
    borderRadius: 18,
    padding: "clamp(16px, 2.8vw, 26px)",
    textAlign: "center",
    background: "rgba(17, 24, 39, 0.75)", // slate-900-ish
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },

  nowUpFlash: {
    outline: "3px solid rgba(148, 163, 184, 0.22)", // subtle slate ring
    animation: "softFlashDark 650ms ease",
  },

  nowUpName: {
    marginTop: 6,
    fontWeight: 950,
    letterSpacing: -0.5,
    lineHeight: 1.0,
    fontSize: "clamp(34px, 7.4vw, 90px)",
    color: "#f9fafb",
  },

  nowUpSub: {
    marginTop: 6,
    fontWeight: 800,
    opacity: 0.75,
    fontSize: "clamp(14px, 2.4vw, 22px)",
    minHeight: 24,
    color: "rgba(229,231,235,0.72)",
  },

  listCard: {
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(17, 24, 39, 0.65)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },

  listHeader: {
    padding: "14px 16px 10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.18)",
  },

  headerMeta: {
    marginTop: 6,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    alignItems: "baseline",
    fontSize: "clamp(12px, 2vw, 16px)",
    fontWeight: 800,
    opacity: 0.75,
    color: "rgba(229,231,235,0.72)",
  },

  headerStrong: {
    color: "#f9fafb",
    opacity: 1,
  },

  dot: { opacity: 0.35 },

  listBody: {
    display: "grid",
  },

  row: {
    padding: "clamp(12px, 2.6vw, 18px) clamp(14px, 3vw, 18px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "transparent",
  },

  rowMain: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },

  rowName: {
    fontWeight: 900,
    fontSize: "clamp(18px, 4vw, 34px)",
    lineHeight: 1.05,
    color: "rgba(249,250,251,0.92)",
  },

  rowMeta: {
    fontWeight: 800,
    opacity: 0.62,
    fontSize: "clamp(12px, 2.2vw, 18px)",
    whiteSpace: "nowrap",
    textAlign: "right",
    minWidth: 1,
    color: "rgba(229,231,235,0.62)",
  },

  // Subtle “window” for Up Next — muted slate/steel (not neon)
  upNextWindow: {
    margin: 12,
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.22)",
    background: "rgba(148, 163, 184, 0.10)",
    overflow: "hidden",
  },

  upNextHeader: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.12)",
  },

  upNextTitle: {
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 15px)",
    opacity: 0.9,
    color: "rgba(229,231,235,0.85)",
  },

  upNextRow: {
    background: "rgba(255,255,255,0.04)",
  },

  emptyRow: {
    padding: "clamp(12px, 2.6vw, 18px)",
    textAlign: "center",
    fontWeight: 900,
    opacity: 0.55,
    fontSize: "clamp(18px, 3.6vw, 30px)",
    color: "rgba(229,231,235,0.72)",
  },

  emptyState: {
    padding: 18,
    textAlign: "center",
    fontWeight: 900,
    opacity: 0.75,
    color: "rgba(229,231,235,0.75)",
  },

  footer: {
    textAlign: "center",
    opacity: 0.6,
    fontWeight: 800,
    fontSize: "clamp(11px, 1.8vw, 14px)",
    marginTop: 2,
    color: "rgba(229,231,235,0.60)",
  },
};
