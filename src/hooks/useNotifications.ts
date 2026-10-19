import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  deleteMyNotifications,
  getMyUnreadNotificationCount,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  type SigaproNotification,
} from "@/integrations/notifications/notificationClient";

const NOTIFICATION_CHANGED_EVENT = "sigapro:notifications-changed";

export function emitNotificationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_CHANGED_EVENT));
  }
}

export function useNotifications(options?: {
  includeItems?: boolean;
  limit?: number;
  pollMs?: number;
}) {
  const { session } = usePlatformSession();
  const includeItems = options?.includeItems ?? true;
  const limit = options?.limit ?? 100;
  const pollMs = Math.max(5000, options?.pollMs ?? 12000);

  const [notifications, setNotifications] = useState<SigaproNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(includeItems);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!session?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const [items, count] = await Promise.all([
        includeItems
          ? listMyNotifications({ limit, unreadOnly: false })
          : Promise.resolve<SigaproNotification[]>([]),
        getMyUnreadNotificationCount(),
      ]);
      if (includeItems) setNotifications(items);
      setUnreadCount(count);
      setError("");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível atualizar as notificações.",
      );
    } finally {
      setLoading(false);
    }
  }, [includeItems, limit, session?.id]);

  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);

    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onChanged = () => void refresh();

    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATION_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATION_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollMs, refresh]);

  const markRead = useCallback(
    async (notificationId: string, read = true) => {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                isRead: read,
                readAt: read ? new Date().toISOString() : undefined,
              }
            : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current + (read ? -1 : 1)));

      try {
        await markMyNotificationRead(notificationId, read);
        emitNotificationsChanged();
      } catch (markError) {
        await refresh();
        throw markError;
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt || new Date().toISOString(),
      })),
    );
    setUnreadCount(0);

    try {
      await markAllMyNotificationsRead();
      emitNotificationsChanged();
    } catch (markError) {
      await refresh();
      throw markError;
    }
  }, [refresh]);

  const deleteNotifications = useCallback(
    async (notificationIds?: string[]) => {
      const ids = (notificationIds ?? []).filter(Boolean);
      if (ids.length > 0) {
        setNotifications((current) => current.filter((item) => !ids.includes(item.id)));
      } else {
        setNotifications([]);
      }

      try {
        await deleteMyNotifications(ids);
        await refresh();
        emitNotificationsChanged();
      } catch (deleteError) {
        await refresh();
        throw deleteError;
      }
    },
    [refresh],
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.isRead),
    [notifications],
  );

  return {
    notifications,
    unreadNotifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    deleteNotifications,
  };
}
