import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarSize = "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  name?: string | null;
  imageUrl?: string | null;
  size?: UserAvatarSize;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  title?: string;
}

const sizeClasses: Record<UserAvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
};

function getInitials(name?: string | null) {
  const safe = name?.trim();
  if (!safe) return "";
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function UserAvatar({
  name,
  imageUrl,
  size = "md",
  className,
  imageClassName,
  fallbackClassName,
  title,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <Avatar
      className={cn(
        sizeClasses[size],
        "shrink-0 rounded-full border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#eef4f9_100%)] shadow-[0_8px_20px_rgba(15,42,68,0.10)]",
        className,
      )}
      title={title || name || "Usuário"}
    >
      {showImage ? (
        <AvatarImage
          src={imageUrl ?? undefined}
          alt={name || "Usuário"}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-[linear-gradient(180deg,#f8fbff_0%,#dde7f1_100%)] font-semibold text-[#16324a]",
          fallbackClassName,
        )}
      >
        {initials ? (
          <span className="leading-none">{initials}</span>
        ) : (
          <UserRound className="h-[52%] w-[52%] text-[#4F6478]" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
