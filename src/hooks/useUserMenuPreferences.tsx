import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const { authenticatedUserId } = useAuthGateway();
  const [hiddenItems, setHiddenItems] = useState<MenuPreferenceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    if (!authenticatedUserId || !supabase) {
      setHiddenItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("user_menu_preferences")
        .select("hidden_items")
        .eq("user_id", authenticatedUserId)
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
  }, [authenticatedUserId]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const setItemHidden = useCallback(
    async (key: MenuPreferenceKey, hidden: boolean) => {
      if (!authenticatedUserId || !supabase) return;

      const nextHidden = new Set(hiddenItems);
      if (hidden) {
        nextHidden.add(key);
      } else {
        nextHidden.delete(key);
      }

      const payload = {
        user_id: authenticatedUserId,
        hidden_items: Array.from(nextHidden),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("user_menu_preferences")
        .upsert(payload, { onConflict: "user_id" });

      if (upsertError) {
        throw upsertError;
      }

      setHiddenItems(Array.from(nextHidden));
    },
    [authenticatedUserId, hiddenItems],
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
