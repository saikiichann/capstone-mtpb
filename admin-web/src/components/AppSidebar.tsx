import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  Car,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ClipboardPlus,
  Database,
  FileOutput,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  Lock,
  LogOut,
  Map as MapIcon,
  Monitor,
  QrCode,
  Radio,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { auth } from "../firebase";
import { useStaffProfile } from "../lib/useStaffProfile";
import ChangePasswordModal from "./ChangePasswordModal";
import { endSession } from "../lib/staffSession";
import { useStaffAlerts } from "../lib/staffAlerts";
import mtpbLogo from "../assets/mtpb-logo.png";
import "./AppSidebar.css";

/* ------------------------------------------------------------------
   AppSidebar — iisang sidebar para sa lahat ng role.

   Dati, bawat page ay may sariling kopya ng <aside className="sidebar">.
   Ngayon, ipinapasa lang ng page ang nav groups niya (pareho pa rin ang
   laman: label, icon, path, active) at dito na ginagawa ang itsura:
   line icons, collapsible groups, at user card na may Log out sa baba.
------------------------------------------------------------------ */

type AnyIcon = string | ComponentType<{ size?: string | number; className?: string }>;

export type SidebarItem = {
  label: string;
  path: string;
  icon?: AnyIcon;
  active?: boolean;
  badge?: number;
};

export type SidebarGroup = {
  label?: string;
  title?: string;
  items: SidebarItem[];
};

type Props = {
  groups: SidebarGroup[];
  /** Shown under "MTPB Admin" (e.g. "Officer in Charge"). */
  role: ReactNode;
};

/** Same line icons as the concept boards, matched by the page name. */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  dashboard: LayoutDashboard,
  "sector analytics": ChartColumn,
  "geospatial heatmap": MapIcon,
  "clamping log": Lock,
  "impounding log": Truck,
  "active impounding": Truck,
  "impound records": ClipboardPlus,
  "vehicles in yard": Warehouse,
  "vehicle history": History,
  "all violations": ClipboardList,
  "pending payments": Wallet,
  "payment verification": BadgeCheck,
  "transaction history": Receipt,
  "revenue reports": TrendingUp,
  "all reports": FileText,
  "export center": FileOutput,
  "release requests": ScrollText,
  "release queue": ListOrdered,
  "queue monitor": ListOrdered,
  "release orders": ScrollText,
  "release log": Car,
  "field updates": Radio,
  "operation scheduler": CalendarDays,
  "system health": Activity,
  "backup & restore": Database,
  "user management": Users,
  "roles & permissions": ShieldCheck,
  "session monitor": Monitor,
  "qr codes": QrCode,
  "qr code management": QrCode,
  "audit log": FileText,
  "data privacy log": Lock,
  settings: Settings,
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Open/closed state per group, kept while moving between pages. */
const openState = new Map<string, boolean>();

/** Groups only fold when the menu is long (OIC, Supervisor). */
const COLLAPSE_AFTER = 10;

function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function ItemIcon({ item }: { item: SidebarItem }) {
  const Lucide = ICONS[clean(item.label).toLowerCase()];
  if (Lucide) return <Lucide size={18} className="mt-nav-icon" aria-hidden="true" />;
  if (typeof item.icon === "string") {
    return <img src={item.icon} alt="" className="mt-nav-icon mt-nav-icon-img" />;
  }
  if (item.icon) {
    const Comp = item.icon;
    return <Comp size={18} className="mt-nav-icon" />;
  }
  return <LayoutDashboard size={18} className="mt-nav-icon" aria-hidden="true" />;
}

export default function AppSidebar({ groups, role }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useStaffProfile();
  const [, force] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  // Red badges: new clamps / impounds / operations, payments to verify (lib/staffAlerts.ts).
  const { badges, markPageSeen } = useStaffAlerts();
  const badgeOf = (item: SidebarItem) => item.badge ?? badges[item.path] ?? 0;

  // On a page with a badge: what's there now counts as seen.
  const currentBadge = badges[pathname.replace(/\/$/, "")] ?? 0;
  useEffect(() => {
    const path = pathname.replace(/\/$/, "");
    if (currentBadge > 0 && path in badges) markPageSeen(path);
  }, [pathname, currentBadge, badges, markPageSeen]);

  // Account menu: close on a click outside it or on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Phones: the menu is one sideways row, so bring the current page into view.
  useEffect(() => {
    if (window.innerWidth > 768) return;
    const el = navRef.current?.querySelector<HTMLElement>(".mt-nav-item.is-active");
    const row = navRef.current;
    if (!el || !row) return;
    const offset = el.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    row.scrollLeft = offset - (row.clientWidth - el.offsetWidth) / 2;
  }, [pathname]);

  const isActive = (item: SidebarItem) =>
    item.active ?? (pathname === item.path || pathname === item.path + "/");

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const collapsible = total > COLLAPSE_AFTER;

  const groupKey = (g: SidebarGroup, i: number) =>
    `${groups[0]?.items[0]?.path ?? ""}|${clean(g.label ?? g.title ?? String(i))}`;

  const isOpen = (g: SidebarGroup, i: number) => {
    if (!collapsible || i === 0) return true;
    if (g.items.some(isActive)) return true;
    return openState.get(groupKey(g, i)) ?? false;
  };

  const toggle = (g: SidebarGroup, i: number) => {
    openState.set(groupKey(g, i), !isOpen(g, i));
    force((n) => n + 1);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await endSession();
      await signOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      navigate("/", { replace: true });
    }
  };

  const name = profile?.name || auth.currentUser?.email?.split("@")[0] || "Staff";
  const username = auth.currentUser?.email?.split("@")[0] ?? "";

  return (
    <aside className="sidebar mt-sidebar">
      <div className="mt-brand">
        <img src={mtpbLogo} alt="MTPB logo" className="mt-brand-logo" />
        <div className="mt-brand-text">
          <p className="mt-brand-name">MTPB Admin</p>
          <p className="mt-brand-role">{role}</p>
        </div>
      </div>

      <nav className="mt-nav" aria-label="Main" ref={navRef}>
        {groups.map((g, i) => {
          const label = clean(g.label ?? g.title ?? "");
          const open = isOpen(g, i);
          const badge = g.items.reduce((n, it) => n + badgeOf(it), 0);
          const canToggle = collapsible && i !== 0 && !g.items.some(isActive);
          return (
            <div className="mt-nav-group" key={label || i}>
              {label &&
                (canToggle ? (
                  <button
                    type="button"
                    className="mt-nav-group-head"
                    aria-expanded={open}
                    onClick={() => toggle(g, i)}
                  >
                    <span>{label}</span>
                    <span className="mt-nav-group-end">
                      {!open && badge > 0 && <span className="mt-badge">{badge}</span>}
                      {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    </span>
                  </button>
                ) : (
                  <p className="mt-nav-group-head mt-nav-group-static">{label}</p>
                ))}
              {(
                <ul className="mt-nav-list" hidden={!open}>
                  {g.items.map((item) => {
                    const active = isActive(item);
                    return (
                      <li key={item.path + item.label}>
                        <button
                          type="button"
                          className={`mt-nav-item${active ? " is-active" : ""}`}
                          aria-current={active ? "page" : undefined}
                          onClick={() => navigate(item.path)}
                        >
                          <ItemIcon item={item} />
                          <span className="mt-nav-label">{clean(item.label)}</span>
                          {badgeOf(item) > 0 && (
                            <span className="mt-badge" aria-label={`${badgeOf(item)} new`}>
                              {badgeOf(item) > 99 ? "99+" : badgeOf(item)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Account: name opens a menu (Change password, Log out);
          the icon on the right logs out in one click. */}
      <div className="mt-user" ref={userRef}>
        <button
          type="button"
          className="mt-user-main"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${name}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="mt-user-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="mt-user-text">
            <span className="mt-user-name">{name}</span>
            {username && <span className="mt-user-sub">{username}</span>}
          </span>
        </button>
        <button type="button" className="mt-user-logout" aria-label="Log out" title="Log out" onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" />
        </button>

        {menuOpen && (
          <div className="mt-user-menu" role="menu" aria-label="Account">
            <div className="mt-user-menu-head">
              <span className="mt-user-menu-name">{name}</span>
              <span className="mt-user-menu-role">{role}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="mt-user-menu-item"
              onClick={() => {
                setMenuOpen(false);
                setShowChangePassword(true);
              }}
            >
              <KeyRound size={16} aria-hidden="true" />
              Change password
            </button>
            <button type="button" role="menuitem" className="mt-user-menu-item is-danger" onClick={handleLogout}>
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </div>
        )}
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </aside>
  );
}

