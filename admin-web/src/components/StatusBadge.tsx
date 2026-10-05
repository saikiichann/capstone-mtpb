import React from 'react';
import './StatusBadge.css';

export type StatusTone = 'green' | 'yellow' | 'gray' | 'red' | 'blue';

export type StatusBadgeProps = {
  tone?: StatusTone;
  children: React.ReactNode;
};

export default function StatusBadge({
  tone = 'gray',
  children,
}: StatusBadgeProps): JSX.Element {
  return (
    <span className={`status-badge status-badge-${tone}`}>{children}</span>
  );
}