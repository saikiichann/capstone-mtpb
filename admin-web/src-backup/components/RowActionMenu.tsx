import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import './RowActionMenu.css';

export type RowActionMenuProps = {
  options: string[];
  onSelect: (option: string) => void;
};

export default function RowActionMenu({
  options,
  onSelect,
}: RowActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="row-action-menu" ref={ref}>
      <button
        className="row-action-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="row-action-dropdown">
          {options.map((opt) => (
            <button
              key={opt}
              className="row-action-item"
              onClick={() => {
                onSelect(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}