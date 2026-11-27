import { useCallback, useEffect, useRef, useState } from "react";
import {
  listRemoteOwnerConversationMessages,
  markRemoteOwnerConversationRead,
} from "@/integrations/backend/platform";
import type { OwnerProjectLink, OwnerProfessionalMessage } from "@/lib/platform";

/** Dedicated private-chat refresh. A stale response cannot enter another
 * owner's chat or overwrite a newer read, and does not reload the dashboard. */
export function useOwnerPrivateConversation(input: {
  link: OwnerProjectLink | null;
  initialMessages: OwnerProfessionalMessage[];
  active: boolean;
  actorProfileId: string;
}) {
  const { link, initialMessages, active, actorProfileId } = input;
  const [snapshot, setSnapshot] = useState<{
    key: string; messages: OwnerProfessionalMessage[];
  } | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const requestSequence = useRef(0);
  const key = link ? [actorProfileId, link.id, link.projectId, link.ownerUserId, link.professionalUserId].join(":") : "";

  const refresh = useCallback(async () => {
    if (!link || !active || !actorProfileId) return;
    const request = ++requestSequence.current;
    try {
      const fresh = await listRemoteOwnerConversationMessages(link);
      if (request !== requestSequence.current) return;
      setSnapshot({ key, messages: fresh });
      setError("");
      // Reading is also a scoped RPC, never a direct UPDATE bypassing RLS.
      if (fresh.some((message) => message.senderUserId !== actorProfileId && !message.readAt)) {
        void markRemoteOwnerConversationRead(link.id).catch(() => undefined);
      }
    } catch (failure) {
      if (request !== requestSequence.current) return;
      setError(failure instanceof Error ? failure.message : "Não foi possível atualizar a conversa.");
    } finally {
      if (request === requestSequence.current) setIsLoading(false);
    }
  }, [key, link?.id, link?.projectId, link?.ownerUserId, link?.professionalUserId, active, actorProfileId]);

  useEffect(() => {
    if (!active || !link || !actorProfileId) return;
    let mounted = true;
    const poll = () => {
      if (!mounted || document.visibilityState === "hidden") return;
      void refresh();
    };
    setIsLoading(true);
    poll();
    const interval = window.setInterval(poll, 12000);
    window.addEventListener("focus", poll);
    return () => {
      mounted = false;
      requestSequence.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [key, active, actorProfileId, refresh]);

  const messages = snapshot?.key === key ? snapshot.messages : initialMessages;
  return { messages, refresh, error, isLoading };
}
