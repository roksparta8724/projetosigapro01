import { backendClient } from "@/integrations/backend/databaseClient";

export type SigaproNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  municipalityId?: string;
  processId?: string;
  sourceProfileId?: string;
  actionUrl?: string;
  category: string;
  priority: string;
  readAt?: string;
  metadata: Record<string, unknown>;
};

type NotificationRpcRow = {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  municipality_id?: string | null;
  process_id?: string | null;
  source_profile_id?: string | null;
  action_url?: string | null;
  category?: string | null;
  priority?: string | null;
  read_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "details", "detail", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function mapNotification(row: NotificationRpcRow): SigaproNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type || "info",
    isRead: Boolean(row.is_read),
    createdAt: row.created_at || new Date().toISOString(),
    municipalityId: row.municipality_id || undefined,
    processId: row.process_id || undefined,
    sourceProfileId: row.source_profile_id || undefined,
    actionUrl: row.action_url || undefined,
    category: row.category || "sistema",
    priority: row.priority || "normal",
    readAt: row.read_at || undefined,
    metadata: row.metadata || {},
  };
}

export async function listMyNotifications(input?: {
  limit?: number;
  unreadOnly?: boolean;
}) {
  const { data, error } = await backendClient.rpc("get_my_notifications_v1", {
    _limit: input?.limit ?? 100,
    _unread_only: input?.unreadOnly ?? false,
  });

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível carregar suas notificações."),
    );
  }

  return ((data ?? []) as NotificationRpcRow[]).map(mapNotification);
}

export async function getMyUnreadNotificationCount() {
  const { data, error } = await backendClient.rpc(
    "get_my_unread_notification_count_v1",
  );

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível carregar o total de notificações."),
    );
  }

  return Number(data || 0);
}

export async function markMyNotificationRead(
  notificationId: string,
  read = true,
) {
  const { data, error } = await backendClient.rpc(
    "mark_my_notification_read_v1",
    {
      _notification_id: notificationId,
      _read: read,
    },
  );

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível atualizar a notificação."),
    );
  }

  return Boolean(data);
}

export async function markAllMyNotificationsRead() {
  const { data, error } = await backendClient.rpc(
    "mark_all_my_notifications_read_v1",
  );

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível marcar as notificações como lidas."),
    );
  }

  return Number(data || 0);
}

export async function sendMasterSupportNotification(input: {
  title: string;
  message: string;
  priority?: string;
}) {
  const { data, error } = await backendClient.rpc("notify_master_support_v1", {
    _title: input.title,
    _message: input.message,
    _priority: input.priority ?? "normal",
  });

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível enviar o aviso ao Master."),
    );
  }

  return Number(data || 0);
}
