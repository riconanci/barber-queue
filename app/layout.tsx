import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Barber Queue",
  description: "Walk-in queue display + kiosk + staff controls",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
