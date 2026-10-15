"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { NavTooltip } from "@/components/layout/nav-tooltip";
import { isChildActive, isNavActive, navItems, type NavChild, type NavItem } from "@/components/layout/nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  /** User chose the icon-only sidebar (desktop). */
  collapsed: boolean;
  /** Icon rail on screen: collapsed by choice or squeezed below lg. Drives tooltips and the Page flyout. */
  rail: boolean;
  /** "sidebar" also hides labels purely in CSS between md and lg so SSR output never flashes labels. */
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}

const ITEM_BASE =
  "group relative flex h-11 w-full items-center overflow-hidden rounded-xl px-4 text-left text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ITEM_ACTIVE =
  "bg-primary/10 text-primary ring-1 ring-primary/25 hover:bg-primary/10 hover:text-primary dark:bg-nav-active dark:text-white dark:ring-[#9585FF]/40 dark:hover:text-white";
const CHILD_BASE =
  "group relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHILD_ACTIVE =
  "bg-primary/10 text-primary ring-1 ring-primary/25 hover:text-primary dark:bg-[#6555F5]/25 dark:text-white dark:ring-[#9585FF]/30 dark:hover:text-white";

const iconClass = (lit: boolean, size = "h-5 w-5") =>
  cn(
    size,
    "shrink-0 transition-colors duration-200",
    lit ? "text-primary dark:text-white" : "text-muted-foreground group-hover:text-accent-foreground"
  );

function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary dark:bg-[#9585FF]"
    />
  );
}

function UnreadBadge({ count, floating }: { count: number; floating?: boolean }) {
  return (
    <span
      aria-label={`${count} tin nhắn chưa đọc`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#8171FF] font-bold leading-none text-white",
        floating
          ? "absolute right-1 top-1 h-4 min-w-4 px-1 text-[10px]"
          : "h-5 min-w-5 px-1.5 text-[11px]"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function SidebarNav({ collapsed, rail, variant, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const panel = useSearchParams()?.get("panel") ?? null;
  const unread = useUnreadMessages();

  const labelClass = cn(
    "ml-3 min-w-0 flex-1 truncate transition-opacity duration-200",
    collapsed && "pointer-events-none opacity-0",
    variant === "sidebar" && "max-lg:pointer-events-none max-lg:opacity-0"
  );

  return (
    <nav aria-label="Điều hướng chính" className="thin-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
      {navItems.map((item) =>
        item.children ? (
          <NavGroup
            key={item.href}
            item={item}
            pathname={pathname}
            panel={panel}
            unread={unread}
            rail={rail}
            labelClass={labelClass}
            variant={variant}
            onNavigate={onNavigate}
          />
        ) : (
          <NavTooltip key={item.href} label={item.label} enabled={rail}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
              className={cn(ITEM_BASE, isNavActive(pathname, item.href) && ITEM_ACTIVE)}
            >
              {isNavActive(pathname, item.href) && <ActiveBar />}
              <item.icon className={iconClass(isNavActive(pathname, item.href))} />
              <span className={labelClass}>{item.label}</span>
            </Link>
          </NavTooltip>
        )
      )}
    </nav>
  );
}

interface NavGroupProps {
  item: NavItem;
  pathname: string;
  panel: string | null;
  unread: number;
  rail: boolean;
  labelClass: string;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}

function NavGroup(props: NavGroupProps) {
  const { item, pathname, rail } = props;
  const inGroup = isNavActive(pathname, item.href);
  const [open, setOpen] = useState(inGroup);

  // The group follows the route: entering it opens it, leaving it closes it. The chevron still toggles it by hand,
  // and a manual choice stays until the route moves in or out of the group again.
  useEffect(() => {
    setOpen(inGroup);
  }, [inGroup]);

  return rail ? (
    <RailGroup {...props} inGroup={inGroup} />
  ) : (
    <ExpandedGroup {...props} inGroup={inGroup} open={open} setOpen={setOpen} />
  );
}

function ExpandedGroup({
  item,
  pathname,
  panel,
  unread,
  labelClass,
  variant,
  onNavigate,
  inGroup,
  open,
  setOpen,
}: NavGroupProps & { inGroup: boolean; open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const listId = useId();
  const Icon = item.icon;
  // A closed group wears the full active style; an open one leaves that to the active child.
  const strong = inGroup && !open;
  const lit = inGroup;

  return (
    <div>
      <div className="relative">
        <Link
          href={item.href}
          onClick={() => {
            setOpen(true);
            onNavigate?.();
          }}
          aria-current={strong ? "page" : undefined}
          className={cn(ITEM_BASE, "pr-11", strong && ITEM_ACTIVE, inGroup && !strong && "text-foreground")}
        >
          {strong && <ActiveBar />}
          <Icon className={iconClass(lit)} />
          <span className={labelClass}>{item.label}</span>
          {unread > 0 && !open && (
            <span className="ml-2 flex">
              <UnreadBadge count={unread} />
            </span>
          )}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? `Thu gọn nhóm ${item.label}` : `Mở nhóm ${item.label}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "sidebar" && "max-lg:hidden",
            strong
              ? "text-primary hover:bg-primary/15 dark:text-white dark:hover:bg-white/10"
              : "text-muted-foreground hover:bg-primary/15 hover:text-foreground"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      <div
        id={listId}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
          variant === "sidebar" && "max-lg:hidden"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="ml-3 mt-1.5 space-y-0.5 rounded-xl border border-sidebar-border/80 bg-black/5 p-1 dark:bg-black/20">
            {item.children!.map((child) => (
              <li key={child.href}>
                <ChildLink
                  child={child}
                  active={isChildActive(pathname, panel, child)}
                  unread={unread}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ChildLink({
  child,
  active,
  unread,
  onNavigate,
}: {
  child: NavChild;
  active: boolean;
  unread: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={child.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(CHILD_BASE, active && CHILD_ACTIVE)}
    >
      <child.icon className={iconClass(active, "h-4 w-4")} />
      <span className="min-w-0 flex-1 truncate">{child.label}</span>
      {child.showUnread && unread > 0 && <UnreadBadge count={unread} />}
    </Link>
  );
}

// Icon rail: the group becomes a single icon that opens a flyout with the same real destinations.
function RailGroup({
  item,
  pathname,
  panel,
  unread,
  inGroup,
  onNavigate,
}: NavGroupProps & { inGroup: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = item.icon;
  const tip = unread > 0 ? `${item.label} · ${unread} tin chưa đọc` : item.label;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <NavTooltip label={tip} enabled={!menuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tip}
            aria-current={inGroup ? "page" : undefined}
            className={cn(ITEM_BASE, inGroup && ITEM_ACTIVE)}
          >
            {inGroup && <ActiveBar />}
            <Icon className={iconClass(inGroup)} />
            {unread > 0 && <UnreadBadge count={unread} floating />}
          </button>
        </DropdownMenuTrigger>
      </NavTooltip>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={12}
        className="w-56 rounded-xl border-sidebar-border bg-popover p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {item.label}
        </DropdownMenuLabel>
        {item.children!.map((child) => {
          const active = isChildActive(pathname, panel, child);
          return (
            <DropdownMenuItem key={child.href} asChild className="cursor-pointer rounded-lg p-0">
              <Link
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 px-2.5 text-[13px] font-medium",
                  active && "bg-primary/10 text-primary dark:bg-[#6555F5]/25 dark:text-white"
                )}
              >
                <child.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                {child.showUnread && unread > 0 && <UnreadBadge count={unread} />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
