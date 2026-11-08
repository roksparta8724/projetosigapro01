import { useEffect, useState } from "react";
import { privateAvatarObjectKey, resolveAuthorizedAvatarUrl } from "@/lib/privateAvatarRead";

/**
 * Does not leak the private stable R2 URL to <img>. A valid session first
 * obtains the raster bytes and creates a same-origin, revocable object URL.
 * Every change/unmount revokes the previous object URL.
 */
export function useAuthorizedAvatarUrl(source: string | null | undefined): string {
  const raw = String(source || "");
  const objectKey = privateAvatarObjectKey(raw);
  const [loaded, setLoaded] = useState({ source: "", url: "" });

  useEffect(() => {
    if (!objectKey) return;
    const controller = new AbortController();
    let disposed = false;
    let release = () => {};

    void resolveAuthorizedAvatarUrl(raw, controller.signal).then((asset) => {
      if (disposed) {
        asset.revoke();
        return;
      }
      release = asset.revoke;
      setLoaded({ source: raw, url: asset.url });
    }).catch(() => {
      if (!disposed) setLoaded({ source: raw, url: "" });
    });

    return () => {
      disposed = true;
      controller.abort();
      release();
    };
  }, [objectKey, raw]);

  return objectKey ? (loaded.source === raw ? loaded.url : "") : raw;
}
