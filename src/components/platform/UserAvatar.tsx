import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarSize = "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  name?: string | null;
  imageUrl?: string | null;
  size?: UserAvatarSize;
  className?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  crop?: { scale: number; offsetX: number; offsetY: number; editorSize?: number };
  fallbackClassName?: string;
  title?: string;
}

const sizeClasses: Record<UserAvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
};

function alternateLegacyAvatarUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const current = new URL(
      raw,
      typeof window !== "undefined" ? window.location.origin : "https://sigapro.local",
    );

    if (current.pathname === "/api/profile-avatar-open") {
      const source = current.searchParams.get("source") || "";
      if (/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\//i.test(source)) {
        return source;
      }
      return "";
    }

    if (
      current.protocol === "https:" &&
      /(^|\.)supabase\.co$/i.test(current.hostname) &&
      current.pathname.startsWith("/storage/v1/object/public/avatars/")
    ) {
      return `/api/profile-avatar-open?source=${encodeURIComponent(current.toString())}`;
    }
  } catch {
    return "";
  }

  return "";
}

function userInitials(name?: string | null) {
  const clean = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!clean) return "?";

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) {
    const compact = parts[0].replace(/[^\p{L}\p{N}]/gu, "");
    return compact.slice(0, 2).toLocaleUpperCase("pt-BR") || "?";
  }

  const first = parts[0].replace(/[^\p{L}\p{N}]/gu, "").charAt(0);
  const last = parts[parts.length - 1].replace(/[^\p{L}\p{N}]/gu, "").charAt(0);
  return `${first}${last}`.toLocaleUpperCase("pt-BR") || "?";
}

export function UserAvatar({
  name,
  imageUrl,
  size = "md",
  className,
  imageClassName,
  imageStyle,
  crop,
  fallbackClassName,
  title,
}: UserAvatarProps) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const [stableImageUrl, setStableImageUrl] = useState(imageUrl ?? "");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [recoveryImageUrl, setRecoveryImageUrl] = useState("");
  const attemptedRecoveryRef = useRef(new Set<string>());
  const emptyClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    attemptedRecoveryRef.current.clear();
    setRecoveryImageUrl("");
  }, [imageUrl]);

  useEffect(() => {
    if (emptyClearTimerRef.current) {
      window.clearTimeout(emptyClearTimerRef.current);
      emptyClearTimerRef.current = null;
    }

    if (imageUrl === "") {
      // Profile refreshes can briefly expose an empty avatar before the signed
      // URL is resolved. Delay clearing so a valid image never flashes away.
      emptyClearTimerRef.current = window.setTimeout(() => {
        setStableImageUrl("");
        setFailedImageUrl("");
        emptyClearTimerRef.current = null;
      }, 1200);
      return () => {
        if (emptyClearTimerRef.current) {
          window.clearTimeout(emptyClearTimerRef.current);
          emptyClearTimerRef.current = null;
        }
      };
    }

    // A refresh may temporarily return no profile while the remote store is
    // revalidating. Keep the last valid avatar instead of flashing the fallback.
    if (!imageUrl || imageUrl === stableImageUrl) return;

    let cancelled = false;
    const preload = new Image();
    preload.decoding = "async";

    const promoteImage = async () => {
      try {
        await preload.decode();
      } catch {
        // onload already confirms that the resource is usable; decode is only
        // used to avoid swapping before the browser has prepared the bitmap.
      }
      if (cancelled) return;
      setNaturalSize({
        width: preload.naturalWidth || 1,
        height: preload.naturalHeight || 1,
      });
      setStableImageUrl(imageUrl);
      setFailedImageUrl("");
    };

    preload.onload = () => {
      void promoteImage();
    };
    preload.onerror = () => {
      if (cancelled) return;
      if (!stableImageUrl) setFailedImageUrl(imageUrl);
    };
    preload.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, stableImageUrl]);

  useEffect(() => {
    return () => {
      if (emptyClearTimerRef.current) {
        window.clearTimeout(emptyClearTimerRef.current);
      }
    };
  }, []);

  const resolvedImageUrl = recoveryImageUrl || stableImageUrl || imageUrl || "";
  const showImage = Boolean(resolvedImageUrl) && failedImageUrl !== resolvedImageUrl;
  const initials = userInitials(name);
  const sizePixels: Record<UserAvatarSize, number> = { sm: 32, md: 40, lg: 56, xl: 80 };
  const diameter = sizePixels[size];
  const cropRatio = crop ? diameter / Math.max(crop.editorSize ?? 320, 1) : 1;
  const resolvedImageStyle = crop
    ? {
        transform: `translate(${crop.offsetX * cropRatio}px, ${crop.offsetY * cropRatio}px) scale(${crop.scale})`,
        transformOrigin: "center center",
      }
    : imageStyle;

  return (
    <Avatar
      className={cn(
        sizeClasses[size],
        "sig-user-avatar-root relative aspect-square shrink-0 overflow-hidden rounded-full border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#eef4f9_100%)] shadow-[0_8px_20px_rgba(15,42,68,0.10)]",
        className,
      )}
      title={title || name || "Usuario"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "sig-user-avatar-fallback absolute inset-0 flex h-full w-full items-center justify-center rounded-full bg-[linear-gradient(180deg,#f8fbff_0%,#e8eef5_100%)] font-extrabold uppercase tracking-[-0.03em] text-[#17324a] select-none",
          fallbackClassName,
        )}
      >
        {initials}
      </span>
      {showImage ? (
        <img
          src={resolvedImageUrl || undefined}
          alt={name || "Usuario"}
          decoding="async"
          className={cn(
            "sig-user-avatar-image absolute inset-0 block h-full w-full max-w-none bg-white object-cover object-center",
            imageClassName,
          )}
          style={resolvedImageStyle}
          onLoad={(event) => {
            const nextWidth = event.currentTarget.naturalWidth || 1;
            const nextHeight = event.currentTarget.naturalHeight || 1;
            if (nextWidth !== naturalSize.width || nextHeight !== naturalSize.height) {
              setNaturalSize({ width: nextWidth, height: nextHeight });
            }
          }}
          onError={() => {
            const alternate = alternateLegacyAvatarUrl(resolvedImageUrl);
            if (
              alternate &&
              alternate !== resolvedImageUrl &&
              !attemptedRecoveryRef.current.has(alternate)
            ) {
              attemptedRecoveryRef.current.add(resolvedImageUrl);
              attemptedRecoveryRef.current.add(alternate);
              setFailedImageUrl("");
              setRecoveryImageUrl(alternate);
              return;
            }

            setFailedImageUrl(resolvedImageUrl);
          }}
        />
      ) : null}
    </Avatar>
  );
}
