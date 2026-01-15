"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ShopSettings, Barber } from "@/lib/types";
import { getAuthStatus, logout } from "@/app/actions/auth";
import { updateBarbers, updateVisibleCount } from "@/app/actions/settings";

export default function SettingsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<"staff" | "admin" | null>(null);

  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [busy, setBusy] = useState(false);

  // Check auth on mount
  useEffect(() => {
    (async () => {
      const status = await getAuthStatus();
      if (!status.authenticated) {
        router.replace("/staff");
        return;
      }
      setAuthorized(true);
      setRole(status.role);
    })();
  }, [router]);

  // Load settings
  useEffect(() => {
    if (!authorized) return;

    (async () => {
      const s = await supabase.from("shop_settings").select("*").eq("id", true).single();
      setSettings((s.data ?? null) as ShopSettings | null);
    })();

    const ch = supabase
      .channel("settings_page")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_settings" }, (payload) => {
        setSettings(payload.new as ShopSettings);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [authorized]);

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

  async function doLogout() {
    await logout();
    router.replace("/staff");
  }

  // Loading / checking auth
  if (authorized === null) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>Checking authorization...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <button onClick={() => router.push("/staff")} style={styles.backBtn}>
          ← Back
        </button>
        <div style={styles.topBarTitle}>Settings</div>
        <button onClick={doLogout} style={styles.ghostBtn}>
          Lock
        </button>
      </header>

      <div style={styles.container}>
        {!settings ? (
          <div style={styles.card}>
            <div style={{ opacity: 0.7 }}>Loading settings…</div>
          </div>
        ) : (
          <>
            {/* BARBERS WORKING */}
            <section style={styles.card}>
              <div style={styles.sectionLabel}>Barbers Working</div>
              <div style={styles.sectionSubtitle}>
                Toggle who's in today. Only working barbers appear on the kiosk.
              </div>

              <div style={styles.barberGrid}>
                {settings.barbers.map((b, idx) => (
                  <label key={b.id} style={styles.barberRow}>
                    <input
                      type="checkbox"
                      checked={b.working}
                      onChange={(e) =>
                        run(async () => {
                          const next: Barber[] = settings.barbers.map((x, i) =>
                            i === idx ? { ...x, working: e.target.checked } : x
                          );
                          return await updateBarbers(next);
                        })
                      }
                      style={styles.checkbox}
                    />
                    <span style={styles.barberName}>{b.name}</span>
                    <span style={styles.barberId}>({b.id})</span>
                  </label>
                ))}
              </div>
            </section>

            {/* DISPLAY SETTINGS */}
            <section style={styles.card}>
              <div style={styles.sectionLabel}>Display Settings</div>

              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <div style={styles.settingTitle}>Visible names on TV</div>
                  <div style={styles.settingDesc}>
                    How many names to show on the /display screen
                  </div>
                </div>
                <input
                  type="number"
                  min={5}
                  max={30}
                  value={settings.visible_count}
                  onChange={(e) =>
                    run(async () => updateVisibleCount(Number(e.target.value)))
                  }
                  style={styles.numInput}
                />
              </div>
            </section>

            {/* ADMIN SECTION */}
            {role === "admin" && (
              <section style={styles.card}>
                <div style={styles.sectionLabel}>Admin</div>
                <div style={styles.adminNote}>
                  Admin-only features coming soon: manage barber list, reset queue, view history.
                </div>
              </section>
            )}
          </>
        )}
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

  loading: {
    textAlign: "center",
    padding: 40,
    opacity: 0.7,
    fontWeight: 800,
  },

  topBar: {
    maxWidth: 680,
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

  backBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(249,250,251,0.88)",
    fontWeight: 900,
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

  container: {
    maxWidth: 680,
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

  sectionLabel: {
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: "clamp(12px, 2vw, 15px)",
    opacity: 0.85,
    marginBottom: 4,
    color: "#f9fafb",
  },

  sectionSubtitle: {
    fontSize: "clamp(12px, 2.2vw, 14px)",
    opacity: 0.6,
    fontWeight: 800,
    marginBottom: 14,
  },

  barberGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 10,
  },

  barberRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.12)",
    cursor: "pointer",
  },

  checkbox: {
    width: 20,
    height: 20,
    accentColor: "#94a3b8",
  },

  barberName: {
    fontWeight: 900,
    color: "#f9fafb",
  },

  barberId: {
    opacity: 0.5,
    fontWeight: 800,
    fontSize: "clamp(11px, 2vw, 13px)",
  },

  settingRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.12)",
  },

  settingInfo: {
    flex: 1,
  },

  settingTitle: {
    fontWeight: 900,
    color: "#f9fafb",
    marginBottom: 4,
  },

  settingDesc: {
    fontSize: "clamp(12px, 2.2vw, 14px)",
    opacity: 0.6,
    fontWeight: 800,
  },

  numInput: {
    width: 80,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(0,0,0,0.20)",
    color: "#f9fafb",
    fontWeight: 900,
    fontSize: "clamp(16px, 3vw, 18px)",
    textAlign: "center",
  },

  adminNote: {
    opacity: 0.6,
    fontWeight: 800,
    fontSize: "clamp(12px, 2.2vw, 14px)",
  },
};
