import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drive Player",
  description: "Listen to music from your own Google Drive folder.",
  applicationName: "Drive Player",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Drive Player" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
