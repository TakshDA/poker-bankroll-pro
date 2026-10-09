import {
  BarChart3,
  CalendarDays,
  Coins,
  FileSpreadsheet,
  Gauge,
  Landmark,
  ListOrdered,
  Receipt,
  Settings,
  Target,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: Gauge },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Play",
    items: [
      { href: "/sessions", label: "Sessions", icon: ListOrdered },
      { href: "/cash", label: "Cash games", icon: Coins },
      { href: "/tournaments", label: "Tournaments", icon: Trophy },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/bankroll", label: "Bankroll", icon: Wallet },
      { href: "/ledger", label: "Ledger", icon: Landmark },
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/goals", label: "Goals & limits", icon: Target },
      { href: "/reports", label: "Reports & data", icon: FileSpreadsheet },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
