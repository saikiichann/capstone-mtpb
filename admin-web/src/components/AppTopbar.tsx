import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import type { SidebarGroup, SidebarItem } from "./AppSidebar";
import ActivityBell from "./ActivityBell";
import "./AppTopbar.css";

/* ------------------------------------------------------------------
   AppTopbar — breadcrumb (Group › Page) at saka "Go to page" search.
   Pang-navigate lang ang search: hinahanap nito ang mga page na nasa
   sidebar ng role, kaya walang bagong query sa Firestore.
   Ctrl+K (o ⌘K) para mag-focus agad sa search.
------------------------------------------------------------------ */

type Props = { groups: SidebarGroup[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export default function AppTopbar({ groups }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const isActive = (item: SidebarItem) =>
    item.active ?? (pathname === item.path || pathname === item.path + "/");

  const all = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.map((it) => ({ ...it, label: clean(it.label), group: clean(g.label ?? g.title ?? "") })),
      ),
    [groups],
  );

  const current = all.find(isActive);
  const crumbGroup = current?.group || "Dashboard";
  const crumbPage = current?.label ?? "";

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.filter((it) => it.label.toLowerCase().includes(t) || it.group.toLowerCase().includes(t));
  }, [all, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    navigate(path);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const pick = matches[hi];
      if (pick) go(pick.path);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="mt-topbar">
      <nav className="mt-crumb" aria-label="Breadcrumb">
        <span>{crumbGroup}</span>
        {crumbPage && (
          <>
            <ChevronRight size={14} aria-hidden="true" className="mt-crumb-sep" />
            <span className="mt-crumb-current" aria-current="page">{crumbPage}</span>
          </>
        )}
      </nav>

      <div className="mt-search">
        <Search size={17} aria-hidden="true" className="mt-search-icon" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Go to page"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[hi] ? `${listId}-${hi}` : undefined}
          placeholder="Go to page…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <kbd className="mt-kbd" aria-hidden="true">Ctrl K</kbd>

        {open && (
          <ul className="mt-search-list" id={listId} role="listbox">
            {matches.length === 0 ? (
              <li className="mt-search-empty">No page named “{q}”</li>
            ) : (
              matches.map((it, i) => (
                <li
                  key={it.path + it.label}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  className={`mt-search-item${i === hi ? " is-hi" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(it.path);
                  }}
                  onMouseEnter={() => setHi(i)}
                >
                  <span>{it.label}</span>
                  <span className="mt-search-group">{it.group}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <ActivityBell />
    </div>
  );
}
