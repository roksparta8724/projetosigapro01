import { useCallback, useEffect, useMemo, useState } from "react";
import { databaseClient as db, hasBackendEnv } from "@/integrations/backend/databaseClient";
import { useAuthGateway } from "@/hooks/useAuthGateway";

export type MenuPreferenceKey =
  | "notifications"
  | "history"
  | "legislation"
  | "finance"
  | "external"
  | "protocols"
  | "analysis";

interface MenuPreferencesState {
  hiddenItems: MenuPreferenceKey[];
  loading: boolean;
  error: string | null;
  setItemHidden: (key: MenuPreferenceKey, hidden: boolean) => Promise<void>;
  isItemVisible: (key: MenuPreferenceKey) => boolean;
}

export function useUserMenuPreferences(): MenuPreferencesState {
  const { authenticatedProfileId } = useAuthGateway();
  const [hiddenItems, setHiddenItems] = useState<MenuPreferenceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    if (!authenticatedProfileId || !db) {
      setHiddenItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await db
        .from("user_menu_preferences")
        .select("hidden_items")
        .eq("profile_id", authenticatedProfileId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      const items = Array.isArray(data?.hidden_items)
        ? (data?.hidden_items as MenuPreferenceKey[])
        : [];
      setHiddenItems(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar preferências do menu.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authenticatedProfileId]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const setItemHidden = useCallback(
    async (key: MenuPreferenceKey, hidden: boolean) => {
      if (!authenticatedProfileId || !db) return;

      const nextHidden = new Set(hiddenItems);
      if (hidden) {
        nextHidden.add(key);
      } else {
        nextHidden.delete(key);
      }

      if (!hasBackendEnv || !db) {
        throw new Error("Banco oficial indisponível para salvar preferências do menu.");
      }

      const { error: upsertError } = await db.rpc("save_user_menu_preferences", {
        _hidden_items: Array.from(nextHidden),
      });

      if (upsertError) {
        throw upsertError;
      }

      setHiddenItems(Array.from(nextHidden));
    },
    [authenticatedProfileId, hiddenItems],
  );

  const isItemVisible = useCallback(
    (key: MenuPreferenceKey) => !hiddenItems.includes(key),
    [hiddenItems],
  );

  return useMemo(
    () => ({
      hiddenItems,
      loading,
      error,
      setItemHidden,
      isItemVisible,
    }),
    [hiddenItems, loading, error, setItemHidden, isItemVisible],
  );
}
