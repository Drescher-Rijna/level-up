"use client";

import {
  Dumbbell,
  House,
  Network,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";

const TABS = [
  { label: "Today", href: "/", icon: House },
  { label: "Train", href: "/workouts", icon: Dumbbell },
  { label: "Progress", href: "/progress", icon: Network },
  { label: "Log", href: "/stats", icon: Plus },
  { label: "Me", href: "/settings", icon: UserRound },
] as const;

type MainTab = (typeof TABS)[number]["label"];

export default function MainNavigation({ active }: { active: MainTab }) {
  return (
    <nav className="progression-tab-bar progression-main-tab-bar" aria-label="Main navigation">
      {TABS.map(({ label, href, icon: Icon }) => (
        <Link
          key={label}
          className={`progression-tab${active === label ? " is-active" : ""}`}
          aria-current={active === label ? "page" : undefined}
          href={href}
        >
          <Icon size={20} strokeWidth={active === label ? 2.4 : 1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
