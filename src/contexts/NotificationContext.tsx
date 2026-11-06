import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient.ts';
import { useAuth } from './AuthContext.tsx';
import { useToast } from './ToastContext.tsx';
import type { NotificationWithActor } from '../types/database.ts';

interface NotificationContextType {
  notifications: NotificationWithActor[];
  unreadCount: number;
  loading: boolean;
  desktopAlertsEnabled: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  toggleDesktopAlerts: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState<NotificationWithActor[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState(() => {
    try {
      return localStorage.getItem('taskboard_desktop_alerts') === 'true';
    } catch {
      return false;
    }
  });

  const desktopAlertsRef = useRef(desktopAlertsEnabled);
  useEffect(() => {
    desktopAlertsRef.current = desktopAlertsEnabled;
  }, [desktopAlertsEnabled]);

  // Load notifications and unread count
  const loadNotifications = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      // 1. Load latest 30 notifications with actor profiles
      const { data, error } = await supabase
        .from('notifications')
        .select('*, actor:profiles!notifications_actor_id_fkey(username, display_name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data as NotificationWithActor[]);
      }

      // 2. Count unread with a head count query where read = false
      const { count, error: countErr } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (!countErr && count !== null) {
        setUnreadCount(count);
      }
    } catch {
      // silent catch for background poll
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe in real-time to notifications table for user
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const userId = user.id;
    loadNotifications(userId);

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newRow = payload.new as NotificationWithActor;

          // Fetch actor profile if actor_id exists
          let actorInfo: { username: string; display_name: string | null } | null = null;
          if (newRow.actor_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('username, display_name')
              .eq('id', newRow.actor_id)
              .maybeSingle();

            if (profileData) {
              actorInfo = profileData;
            }
          }

          const completeRow: NotificationWithActor = {
            ...newRow,
            actor: actorInfo,
          };

          // 1. Add to top
          setNotifications((prev) => {
            if (prev.some((n) => n.id === completeRow.id)) return prev;
            return [completeRow, ...prev].slice(0, 30);
          });

          // 2. Increase badge
          setUnreadCount((c) => c + 1);

          // 3. Show in-app toast
          showToast(completeRow.message, 'info');

          // 4. Show desktop notification if enabled and tab is hidden
          if (
            desktopAlertsRef.current &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            document.hidden
          ) {
            try {
              new Notification('Taskboard', {
                body: completeRow.message,
              });
            } catch {
              // Ignore background permission restrictions
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadNotifications, showToast]);

  // Mark single notification as read
  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
    } catch {
      // rollback or re-fetch on failure
      if (user) loadNotifications(user.id);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!user) return;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
    } catch {
      if (user) loadNotifications(user.id);
    }
  };

  // Toggle desktop alerts with permission prompt
  const toggleDesktopAlerts = async () => {
    if (!desktopAlertsEnabled) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            setDesktopAlertsEnabled(true);
            try {
              localStorage.setItem('taskboard_desktop_alerts', 'true');
            } catch {
              // ignore
            }
            showToast('Desktop alerts enabled', 'success');
          } else {
            showToast('Desktop notification permission was denied', 'error');
          }
        } catch {
          showToast('Unable to request desktop notification permission', 'error');
        }
      } else {
        showToast('Desktop notifications are not supported by your browser', 'error');
      }
    } else {
      setDesktopAlertsEnabled(false);
      try {
        localStorage.setItem('taskboard_desktop_alerts', 'false');
      } catch {
        // ignore
      }
      showToast('Desktop alerts disabled', 'info');
    }
  };

  const refreshNotifications = async () => {
    if (user) {
      await loadNotifications(user.id);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        desktopAlertsEnabled,
        markAsRead,
        markAllAsRead,
        toggleDesktopAlerts,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
