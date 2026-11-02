import React, { useState, useRef, useEffect } from 'react';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import keyIcon from '../assets/key.png';
import logoutIcon from '../assets/logout.png';
import ChangePasswordModal from './ChangePasswordModal';
import './UserMenu.css';

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  function handleLogout() {
    // TODO: clear auth token / user session here
    // e.g. localStorage.removeItem('token');
    setOpen(false);
    navigate('/login');
  }

  return (
    <>
      <div className="avatar-container" ref={ref}>
        <button
          className="avatar-btn"
          onClick={() => setOpen((o) => !o)}
          aria-label="User menu"
        >
          <User size={16} />
        </button>

        {open && (
          <div className="profile-dropdown">
            {/* Dark header */}
            <div className="dropdown-header">
              <p className="dropdown-name">S. Bautista</p>
              <p className="dropdown-role">Officer in Charge</p>
            </div>

            {/* White body */}
            <div className="dropdown-body">
              <button
                className="dropdown-item"
                onClick={() => {
                  setShowChangePassword(true);
                  setOpen(false);
                }}
              >
                <img src={keyIcon} alt="" className="dropdown-icon" />
                Change Password
              </button>

              <button
                className="dropdown-item dropdown-item-logout"
                onClick={handleLogout}
              >
                <img src={logoutIcon} alt="" className="dropdown-icon" />
                Log Out
              </button>
            </div>
          </div>
        )}
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}