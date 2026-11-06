import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useNotifications } from '../../contexts/NotificationContext.tsx';
import { formatRelativeTime } from '../../lib/formatters.ts';
import type { NotificationWithActor } from '../../types/database.ts';
import {
  KanbanSquare,
  Bell,
  BellRing,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Menu,
  X,
  CheckCheck,
  Loader2,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    desktopAlertsEnabled,
    markAsRead,
    markAllAsRead,
    toggleDesktopAlerts,
  } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const handleNotificationClick = async (notif: NotificationWithActor) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    setNotificationsOpen(false);
    if (notif.project_id) {
      if (notif.task_id) {
        navigate(`/p/${notif.project_id}?task=${notif.task_id}`);
      } else {
        navigate(`/p/${notif.project_id}`);
      }
    }
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'User';
  const username = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'user';
  const avatarInitials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0].toUpperCase())
    .join('') || username.slice(0, 2).toUpperCase();

  const isProjectsActive = location.pathname === '/' || location.pathname.startsWith('/p/');
  const isMyTasksActive = location.pathname === '/my-tasks';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-slate-900 hover:text-blue-600 transition-colors shrink-0"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <KanbanSquare className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                Taskboard
              </span>
            </Link>

            {/* Zone 2: Navigation Links (Desktop) */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isProjectsActive
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Projects
              </Link>
              <Link
                to="/my-tasks"
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isMyTasksActive
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                My Tasks
              </Link>
            </nav>
          </div>

          {/* Zone 3: Actions (Notification bell + User Menu) */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Notification Bell */}
            <div className="relative" ref={bellRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={notificationsOpen}
                title="Notifications"
              >
                {desktopAlertsEnabled ? (
                  <BellRing className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}

                {/* Badge: hide at 0, exact count 1-9, 9+ above 9 */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 text-left overflow-hidden animate-in fade-in slide-in-from-top-2">
                  {/* Header */}
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">Notifications</span>
                      {unreadCount > 0 ? (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {unreadCount} unread
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">All caught up</span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllAsRead()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded px-1 py-0.5"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all as read</span>
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {loading && notifications.length === 0 ? (
                      <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        <span className="text-xs">Loading notifications...</span>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2 stroke-1" />
                        <p className="text-xs font-medium text-slate-700">No notifications yet</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Task assignments, project updates, and activity will show up here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((item) => {
                        const actorName =
                          item.actor?.display_name || item.actor?.username || null;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 ${
                              !item.read ? 'bg-blue-50/40' : 'bg-white'
                            }`}
                          >
                            {/* Unread dot */}
                            <div className="mt-1 shrink-0">
                              {!item.read ? (
                                <span
                                  className="block w-2 h-2 rounded-full bg-blue-600 ring-2 ring-blue-100"
                                  title="Unread"
                                />
                              ) : (
                                <span className="block w-2 h-2 rounded-full bg-transparent" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs leading-snug break-words ${
                                  !item.read
                                    ? 'text-slate-900 font-medium'
                                    : 'text-slate-600 font-normal'
                                }`}
                              >
                                {item.message}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                {actorName && (
                                  <span className="truncate text-slate-500">
                                    by <strong className="font-medium text-slate-600">{actorName}</strong>
                                  </span>
                                )}
                                {actorName && <span>•</span>}
                                <span className="shrink-0">
                                  {formatRelativeTime(item.created_at)}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer: Desktop alerts toggle */}
                  <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <BellRing className="w-3.5 h-3.5 text-slate-400" />
                      <span>Desktop alerts</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDesktopAlerts()}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        desktopAlertsEnabled ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={desktopAlertsEnabled}
                      title={desktopAlertsEnabled ? 'Disable desktop alerts' : 'Enable desktop alerts'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          desktopAlertsEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Menu Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold shadow-sm">
                  {avatarInitials}
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-900 leading-tight max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    @{username}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 ml-0.5" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">@{username}</p>
                    {user?.email && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                    )}
                  </div>

                  <div className="py-1">
                    <div className="px-3.5 py-1.5 text-xs text-slate-500 flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Account active</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 md:hidden rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation tray */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-3 space-y-1">
          <Link
            to="/"
            className={`block px-3 py-2 rounded-lg text-sm font-medium ${
              isProjectsActive ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Projects
          </Link>
          <Link
            to="/my-tasks"
            className={`block px-3 py-2 rounded-lg text-sm font-medium ${
              isMyTasksActive ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            My Tasks
          </Link>
        </div>
      )}
    </header>
  );
};
