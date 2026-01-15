"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addClient } from "@/app/actions/queue";
import type { Barber, ShopSettings } from "@/lib/types";

export default function KioskPage() {
  const [settings, setSettings] = useState<ShopSettings | null>(null);

  const [name, setName] = useState("");
  const [preferred, setPreferred] = useState<string | null>(null);

  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [doneTime, setDoneTime] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data } = await supabase.from("shop_settings").select("*").eq("id", true).single();
      if (!mounted) return;
      setSettings((data ?? null) as ShopSettings | null);
    }

    load();

    const ch = supabase
      .channel("settings_kiosk")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_settings" }, (payload) => {
        setSettings(payload.new as ShopSettings);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const workingBarbers: Barber[] = useMemo(
    () => (settings?.barbers ?? []).filter((b) => b.working),
    [settings]
  );

  // Parse name: "John Q" -> first="John", initial="Q"
  const parseName = (input: string) => {
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return { first: trimmed, initial: "" };
    
    const lastPart = parts[parts.length - 1];
    // If last part is a single character, use it as initial
    if (lastPart.length === 1) {
      return {
        first: parts.slice(0, -1).join(" "),
        initial: lastPart.toUpperCase()
      };
    }
    // Otherwise use first character of last part as initial
    return {
      first: parts.slice(0, -1).join(" "),
      initial: lastPart[0].toUpperCase()
    };
  };

  const parsed = parseName(name);
  const canSubmit = parsed.first.length > 0 && parsed.initial.length === 1 && !submitting;

  async function submit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMsg(null);

    const res = await addClient(parsed.first, parsed.initial, preferred);
    setSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error ?? "Could not check in.");
      return;
    }

    const msg = `${parsed.first} ${parsed.initial}.`;
    const time = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    setDoneMsg(msg);
    setDoneTime(time);

    setName("");
    setPreferred(null);

    // auto reset confirmation
    setTimeout(() => {
      setDoneMsg(null);
      setDoneTime(null);
    }, 1500);
  }

  return (
    <div style={styles.page}>
      <style>{`
        input::placeholder { color: rgba(229,231,235,0.45); }
        @keyframes softPop {
          0% { transform: scale(1); opacity: 0.0; }
          15% { transform: scale(1.01); opacity: 1.0; }
          100% { transform: scale(1); opacity: 1.0; }
        }
      `}</style>

      <header style={styles.header}>
        <div style={styles.title}>Check In</div>
        <div style={styles.subtitle}>Walk-in queue</div>
      </header>

      <section style={styles.card}>
        {doneMsg ? (
          <div style={styles.successWrap}>
            <div style={styles.successTitle}>You're in!</div>
            <div style={styles.successMsg}>{doneMsg}</div>
            {doneTime && <div style={styles.successTime}>{doneTime}</div>}
            <div style={styles.successHint}>Please take a seat.</div>
          </div>
        ) : (
          <>
            <div style={styles.fieldGroup}>
              <div style={styles.label}>Name and last initial</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                style={styles.input}
                placeholder="John Q"
              />
            </div>

            <div style={styles.prefsWrap}>
              <div style={styles.prefsLabel}>Waiting for</div>

              <div style={styles.pillRow}>
                <PillButton
                  active={preferred === null}
                  onClick={() => setPreferred(null)}
                  label="Any barber"
                />

                {workingBarbers.map((b) => (
                  <PillButton
                    key={b.id}
                    active={preferred === b.id}
                    onClick={() => setPreferred(b.id)}
                    label={b.name}
                  />
                ))}
              </div>
            </div>

            {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}

            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                ...styles.primaryBtn,
                ...(canSubmit ? {} : styles.primaryBtnDisabled),
              }}
            >
              {submitting ? "Checking in…" : "Check in"}
            </button>

            <div style={styles.footerNote}>
              Please enter your name at the shop kiosk.
            </div>
          </>
        )}
      </section>

      <div style={styles.bottomHint}>
        Tip: enable iPad <b>Guided Access</b> to keep this screen locked.
      </div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.pill,
        ...(active ? styles.pillActive : styles.pillInactive),
      }}
    >
      {label}
    </button>
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
    display: "grid",
    placeItems: "center",
  },

  header: {
    width: "min(720px, 100%)",
    marginBottom: 12,
    textAlign: "center",
  },
  title: {
    fontSize: "clamp(28px, 6vw, 44px)",
    fontWeight: 950,
    letterSpacing: -0.5,
    color: "#f9fafb",
  },
  subtitle: {
    marginTop: 6,
    fontSize: "clamp(14px, 2.6vw, 18px)",
    opacity: 0.7,
  },

  card: {
    width: "min(720px, 100%)",
    borderRadius: 18,
    background: "rgba(17, 24, 39, 0.75)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    padding: "clamp(14px, 3vw, 22px)",
    backdropFilter: "blur(10px)",
  },

  fieldGroup: {
    display: "grid",
    gap: 8,
  },

  label: {
    fontWeight: 850,
    opacity: 0.8,
    fontSize: "clamp(12px, 2.2vw, 15px)",
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

  prefsWrap: {
    marginTop: 16,
  },
  prefsLabel: {
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 14px)",
    opacity: 0.75,
    marginBottom: 10,
  },
  pillRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    borderRadius: 999,
    padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.10)",
    fontWeight: 900,
    fontSize: "clamp(14px, 3.2vw, 16px)",
    cursor: "pointer",
    userSelect: "none",
  },
  pillActive: {
    background: "rgba(148, 163, 184, 0.18)",
    borderColor: "rgba(148, 163, 184, 0.28)",
    color: "#f9fafb",
  },
  pillInactive: {
    background: "rgba(0,0,0,0.18)",
    color: "rgba(249,250,251,0.86)",
  },

  primaryBtn: {
    marginTop: 16,
    width: "100%",
    padding: "16px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(229,231,235,0.92)",
    color: "#0b0f16",
    fontSize: "clamp(18px, 4vw, 22px)",
    fontWeight: 950,
    cursor: "pointer",
  },
  primaryBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },

  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.30)",
    background: "rgba(248, 113, 113, 0.12)",
    color: "rgba(254, 226, 226, 0.95)",
    fontWeight: 850,
  },

  successWrap: {
    textAlign: "center",
    padding: "clamp(18px, 3.5vw, 28px)",
    animation: "softPop 220ms ease",
  },
  successTitle: {
    fontSize: "clamp(20px, 4.5vw, 26px)",
    fontWeight: 950,
    color: "#f9fafb",
  },
  successMsg: {
    marginTop: 10,
    fontSize: "clamp(22px, 5.2vw, 34px)",
    fontWeight: 950,
    letterSpacing: -0.3,
  },
  successHint: {
    marginTop: 10,
    opacity: 0.7,
    fontWeight: 850,
  },
  successTime: {
    marginTop: 8,
    fontSize: "clamp(16px, 3.5vw, 20px)",
    fontWeight: 900,
    opacity: 0.8,
    color: "#94a3b8",
  },

  footerNote: {
    marginTop: 12,
    textAlign: "center",
    opacity: 0.55,
    fontWeight: 800,
    fontSize: "clamp(12px, 2.2vw, 14px)",
  },

  bottomHint: {
    width: "min(720px, 100%)",
    marginTop: 14,
    textAlign: "center",
    opacity: 0.55,
    fontWeight: 800,
    fontSize: "clamp(12px, 2.2vw, 14px)",
  },
};
