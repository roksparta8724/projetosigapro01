import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const notificationsPage = readFileSync(
  resolve(process.cwd(), "src/pages/saas/NotificationsPage.tsx"),
  "utf8",
);
const portal = readFileSync(
  resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"),
  "utf8",
);
const hook = readFileSync(
  resolve(process.cwd(), "src/hooks/useNotifications.ts"),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/integrations/notifications/notificationClient.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "neon/migrations/20261017_notifications_reliable_municipal_flow.sql",
  ),
  "utf8",
);
const permitRouting = readFileSync(
  resolve(
    process.cwd(),
    "neon/migrations/20261017_permit_director_notification_routing.sql",
  ),
  "utf8",
);

describe("municipal notification flow", () => {
  it("renders targeted database notifications instead of deriving the inbox only from process cards", () => {
    expect(notificationsPage).toContain("useNotifications");
    expect(notificationsPage).toContain("officialNotificationItems");
    expect(notificationsPage).toContain("Notificações direcionadas");
    expect(notificationsPage).toContain("Marcar todas como lidas");
    expect(client).toContain("get_my_notifications_v1");
    expect(client).toContain("mark_my_notification_read_v1");
  });

  it("uses unread database notifications for the topbar badge", () => {
    expect(portal).toContain("useNotifications");
    expect(portal).toContain("unreadCount: notificationCount");
    expect(portal).not.toContain("pendingRequirements + awaitingDispatches + pendingGuides");
    expect(hook).toContain("getMyUnreadNotificationCount");
    expect(hook).toContain("setInterval");
    expect(hook).toContain("visibilitychange");
  });

  it("routes relevant municipal events to people and sectors", () => {
    expect(migration).toContain("trg_notifications_process_flow_v1");
    expect(migration).toContain("trg_notifications_requirement_flow_v1");
    expect(migration).toContain("trg_notifications_dispatch_flow_v1");
    expect(migration).toContain("trg_notifications_message_flow_v1");
    expect(migration).toContain("trg_notifications_payment_guide_flow_v1");
    expect(migration).toContain("trg_notifications_permit_signed_v1");
    expect(migration).toContain("notify_municipal_area_v1");
    expect(migration).toContain("notify_process_owner_v1");
    expect(migration).toContain("notify_process_analyst_v1");
  });

  it("isolates Master from municipal operational noise", () => {
    expect(migration).toContain("Master nunca recebe evento operacional da Prefeitura");
    expect(migration).toContain("coalesce(_source_role,'') <> 'prefeitura_admin'");
    expect(migration).toContain("coalesce(_category,'') <> 'master_support'");
    expect(migration).toContain("notifications_select_own");
    expect(migration).not.toContain("create policy notifications_select_scoped");
    expect(notificationsPage).toContain("Suporte ao Master");
    expect(notificationsPage).toContain('session.role === "prefeitura_admin"');
    expect(client).toContain("notify_master_support_v1");
  });

  it("routes the Alvará signature request through the same targeted inbox", () => {
    expect(permitRouting).toContain("enqueue_notification_v1");
    expect(permitRouting).toContain("Alvará aguardando sua assinatura");
    expect(permitRouting).toContain("'assinatura'");
    expect(permitRouting).toContain("?aba=alvara");
    expect(permitRouting).toContain("permit:director-request:");
  });
});
