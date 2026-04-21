"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  glyph: ReactNode;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    glyph: (
      <svg
        viewBox="0 0 18 18"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="6" height="6" rx="1" />
        <rect x="10" y="2" width="6" height="6" rx="1" />
        <rect x="2" y="10" width="6" height="6" rx="1" />
        <rect x="10" y="10" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: "/performance",
    label: "Performance",
    glyph: (
      <svg
        viewBox="0 0 18 18"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12 L5.5 8 L8 10 L12 4 L16 9" />
        <circle cx="12" cy="4" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/sleep",
    label: "Sleep",
    glyph: (
      <svg
        viewBox="0 0 18 18"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 10.5 A6 6 0 1 1 7.5 3.5 A4.5 4.5 0 0 0 14.5 10.5 Z" />
      </svg>
    ),
  },
  {
    href: "/workouts",
    label: "Workouts",
    glyph: (
      <svg
        viewBox="0 0 18 18"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="6.5" width="2" height="5" rx="0.6" />
        <rect x="14" y="6.5" width="2" height="5" rx="0.6" />
        <rect x="5" y="5" width="2" height="8" rx="0.6" />
        <rect x="11" y="5" width="2" height="8" rx="0.6" />
        <path d="M7 9 L11 9" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="side-section" aria-label="Primary">
      <div className="side-section-label">Navigate</div>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="side-link"
            aria-current={active ? "page" : undefined}
          >
            <span className="glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
