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
  summaryFirst = false,
  disabled = false,
  reselectValue,
}: {
  items: Array<{ value: string; label: string; helper?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  urlParam?: string;
  persistInUrl?: boolean;
  summaryFirst?: boolean;
  disabled?: boolean;
  reselectValue?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!persistInUrl || disabled) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get(urlParam);

    if (requested && requested !== value && items.some((item) => item.value === requested)) {
      onChange(requested);
      return;
    }

    // Never force a Summary tab to a different operational tab.
    // The user-selected route/section is authoritative; a query parameter is
    // read only when it explicitly names an available tab.
  }, [disabled, items, location.search, onChange, persistInUrl, urlParam, value]);

  const handleChange = (next: string) => {
    if (disabled) return;
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

  return <InternalSectionNav items={items} value={value} onChange={handleChange} className={className} summaryFirst={summaryFirst} disabled={disabled} reselectValue={reselectValue} />;
}
