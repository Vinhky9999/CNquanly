import { Award, LayoutDashboard, MessageCircle, Package, Truck, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/shipping", label: "Giao Hàng", icon: Truck },
  { href: "/grading", label: "Chấm điểm", icon: Award },
  { href: "/cash-flow", label: "Dòng tiền", icon: Wallet },
  { href: "/messages", label: "Page", icon: MessageCircle },
];

export const isNavActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
