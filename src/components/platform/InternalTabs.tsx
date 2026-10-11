import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { InternalSectionNav } from "@/components/platform/PageLayout";

export function InternalTabs({
  items,
  value,
  onChange,
  className,
  urlParam = "secao",
  persistInUrl = true,
}: {
  items: Array<{ value: string; label: string; helper?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  urlParam?: string;
  persistInUrl?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!persistInUrl) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get(urlParam);
    if (requested && requested !== value && items.some((item) => item.value === requested)) {
      onChange(requested);
    }
  }, [items, location.search, onChange, persistInUrl, urlParam, value]);

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

  return <InternalSectionNav items={items} value={value} onChange={handleChange} className={className} />;
}
