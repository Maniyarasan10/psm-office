import { FiCalendar, FiClipboard } from 'react-icons/fi';
import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <FiCalendar size={22} />
        Attendance
      </NavLink>
      <NavLink
        to="/tasks"
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <FiClipboard size={22} />
        Tasks
      </NavLink>
    </nav>
  );
}
