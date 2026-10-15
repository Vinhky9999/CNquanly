import {
  Award,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  Package,
  Plug,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** A sub-entry. `panel` is the `?panel=` value the Page inbox reads to open the matching dialog. */
export interface NavChild {
  href: string;
  label: string;
  icon: LucideIcon;
  panel?: string;
  /** Shows the real unread-message count next to the entry. */
  showUnread?: boolean;
}

/** Cookie remembering whether the desktop sidebar is collapsed (read by the server layout to avoid a flash). */
export const SIDEBAR_COOKIE = "cn_sidebar";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavChild[];
}

export const navItems: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/shipping", label: "Giao Hàng", icon: Truck },
  { href: "/grading", label: "Chấm điểm", icon: Award },
  { href: "/cash-flow", label: "Dòng tiền", icon: Wallet },
  {
    href: "/messages",
    label: "Page",
    icon: MessageCircle,
    // Only what the app really has: the inbox plus the two dialogs that live inside it.
    children: [
      { href: "/messages", label: "Hộp thư", icon: Inbox, showUnread: true },
      { href: "/messages?panel=connection", label: "Kết nối Page", icon: Plug, panel: "connection" },
      { href: "/messages?panel=templates", label: "Tin nhắn mẫu", icon: MessageSquareText, panel: "templates" },
    ],
  },
];

export const isNavActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** A child is active on its own route and, for dialog shortcuts, only while that dialog's `panel` is in the URL. */
export const isChildActive = (pathname: string, panel: string | null, child: NavChild) =>
  isNavActive(pathname, child.href.split("?")[0]) && (panel ?? null) === (child.panel ?? null);
