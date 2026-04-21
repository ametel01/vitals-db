import { SidebarNav } from "@/components/SidebarNav";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vital — health signal",
  description: "Apple Health analytics, slow-made.",
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <span className="pulse-dot" aria-hidden="true" />
              <span className="brand-mark">
                vital<em>.</em>
              </span>
            </div>

            <SidebarNav />

            <div className="side-footer">
              <div className="side-section-label" style={{ padding: "0 0 8px" }}>
                Instrument
              </div>
              <div>
                <span className="version">v0.10.0</span> · duckdb · bun
              </div>
              <div style={{ marginTop: 4, fontStyle: "italic" }}>Private. On-device. Yours.</div>
            </div>
          </aside>

          <main className="app-main">
            <div className="main-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
