import React from 'react';
import { NavLink } from 'react-router-dom';
import { slugify } from '../utils/slugify';
import './Sidebar.css';

import type { NavGroup } from './Layout';

export type SidebarProps = {
  navGroups: NavGroup[];
  roleLabel: string;
  basePath: string;
};

export default function Sidebar({
  navGroups,
  roleLabel,
  basePath,
}: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">MTPB</div>
        <div className="sidebar-brand-text">
          <p className="sidebar-brand-name">MTPB</p>
          <p className="sidebar-brand-role">{roleLabel}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="nav-group-label">{group.label.toUpperCase()}</p>

            <ul className="nav-list">
              {group.items.map((item) => (
                <li key={item.name}>
                  <NavLink
                    to={`${basePath}/${slugify(item.name)}`}
                    className={({ isActive }) =>
                      isActive ? 'nav-item nav-item-active' : 'nav-item'
                    }
                  >
                    <img src={item.icon} alt="" className="nav-icon" />
                    <span className="nav-label">{item.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}