import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "vitals-db",
  description: "Apple Health analytics dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <h1>vitals-db</h1>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/performance">Performance</Link>
              <Link href="/sleep">Sleep</Link>
              <Link href="/workouts">Workouts</Link>
            </nav>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
