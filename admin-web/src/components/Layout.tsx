import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Layout.css';

export type NavItem = {
  name: string;
  icon: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type LayoutProps = {
  navGroups: NavGroup[];
  roleLabel: string;
  basePath: string;
};

export default function Layout({
  navGroups,
  roleLabel,
  basePath,
}: LayoutProps): JSX.Element {
  return (
    <div className="dashboard">
      <Sidebar
        navGroups={navGroups}
        roleLabel={roleLabel}
        basePath={basePath}
      />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}