import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 42, margin: 0 }}>Barber Queue</h1>
      <p style={{ opacity: 0.75 }}>Quick links:</p>
      <ul style={{ fontSize: 20, lineHeight: 1.8 }}>
        <li><Link href="/kiosk">/kiosk</Link> (client check-in)</li>
        <li><Link href="/display">/display</Link> (TV display)</li>
        <li><Link href="/staff">/staff</Link> (PIN controls + settings)</li>
      </ul>
    </main>
  );
}
