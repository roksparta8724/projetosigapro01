import { useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { InternalSectionNav } from "@/components/platform/PageLayout";

export function InternalTabs({
  items,
  value,
  onChange,
  className,
  urlParam = "secao",
  persistInUrl = true,
  preserveOrder = false,
  preferOperationalDefault = true,
}: {
  items: Array<{ value: string; label: string; helper?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  urlParam?: string;
  persistInUrl?: boolean;
  preserveOrder?: boolean;
  preferOperationalDefault?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!persistInUrl) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get(urlParam);

    if (requested && requested !== value && items.some((item) => item.value === requested)) {
      onChange(requested);
      return;
    }

    if (!requested && preferOperationalDefault) {
      const currentItem = items.find((item) => item.value === value);
      const currentIsSummary =
        currentItem && /^(resumo|vis[aã]o geral)$/i.test(currentItem.label.trim());

      if (currentIsSummary) {
        const firstOperationalItem = items.find(
          (item) => !/^(resumo|vis[aã]o geral)$/i.test(item.label.trim()),
        );
        if (firstOperationalItem && firstOperationalItem.value !== value) {
          onChange(firstOperationalItem.value);
        }
      }
    }
  }, [items, location.search, onChange, persistInUrl, preferOperationalDefault, urlParam, value]);

  const handleChange = (next: string) => {
    if (persistInUrl) {
      const params = new URLSearchParams(location.search);
      params.set(urlParam, next);
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
          hash: location.hash,
        },
        { replace: true, preventScrollReset: true },
      );
    }
    onChange(next);
  };

  return <InternalSectionNav items={items} value={value} onChange={handleChange} className={className} preserveOrder={preserveOrder} />;
}
