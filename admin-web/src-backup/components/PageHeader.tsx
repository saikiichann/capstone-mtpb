import React from 'react';
import UserMenu from './UserMenu';
import './PageHeader.css';

export type PageHeaderProps = {
  title: string;
  date?: string;
};

export default function PageHeader({
  title,
  date,
}: PageHeaderProps){
  const today =
    date ??
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  return (
    <header className="main-header">
      <div>
        <h1>{title}</h1>
        <p>{today}</p>
      </div>
      <UserMenu />
    </header>
  );
}