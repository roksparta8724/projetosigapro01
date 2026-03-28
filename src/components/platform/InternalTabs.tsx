import { InternalSectionNav } from "@/components/platform/PageLayout";

export function InternalTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: string; label: string; helper?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return <InternalSectionNav items={items} value={value} onChange={onChange} className={className} />;
}
