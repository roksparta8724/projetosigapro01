import { useEffect, useState } from "react";
import { privateAvatarObjectKey, resolveAuthorizedAvatarUrl } from "@/lib/privateAvatarRead";
import {
  getAuthorizedAvatarRuntimeUrl, loadAuthorizedAvatarRuntimeUrl,
} from "@/lib/authorizedAvatarRuntimeCache";
import { readAvatarSessionThumbnail } from "@/lib/avatarSessionThumbnail";

/**
 * Does not leak the private stable R2 URL to <img>. A valid session first
 * obtains the raster bytes and creates a same-origin, revocable object URL.
 * Every change/unmount revokes the previous object URL.
 */
export function useAuthorizedAvatarUrl(
  source: string | null | undefined, authenticatedOwnerId?: string | null,
  variant: "original" | "thumbnail" = "original",
): string {
  const raw = String(source || "");
  const objectKey = privateAvatarObjectKey(raw);
  const owner = String(authenticatedOwnerId || "").trim();
  const cacheHit = owner && objectKey ? getAuthorizedAvatarRuntimeUrl(owner, raw, variant) : "";
  // A miniature is bound to the same authenticated browser session, user
  // and exact R2 object reference. Never reuse a thumbnail for another account.
  const previewHit = owner && objectKey && !cacheHit ? readAvatarSessionThumbnail(owner, raw) : "";
  const [loaded, setLoaded] = useState({ source: "", owner: "", url: "" });

  useEffect(() => {
    if (!objectKey) return;
    if (owner) {
      let active = true;
      void loadAuthorizedAvatarRuntimeUrl(owner, raw, variant).then((url) => {
        if (active) setLoaded({ source: raw, owner, url });
      }).catch(() => {
        if (active) setLoaded({ source: raw, owner, url: "" });
      });
      // Shared private images survive route unmount; logout or account change
      // revokes them centrally, never on individual page transitions.
      return () => { active = false; };
    }

    const controller = new AbortController();
    let disposed = false;
    let release = () => {};

    void resolveAuthorizedAvatarUrl(raw, controller.signal, variant).then((asset) => {
      if (disposed) {
        asset.revoke();
        return;
      }
      release = asset.revoke;
      setLoaded({ source: raw, owner: "", url: asset.url });
    }).catch(() => {
      if (!disposed) setLoaded({ source: raw, owner: "", url: "" });
    });

    return () => {
      disposed = true;
      controller.abort();
      release();
    };
  }, [objectKey, raw, owner, variant]);

  // For account-scoped images, only use the live cache. A blob revoked on
  // logout must never be returned from a stale React state.
  return objectKey
    ? (owner ? (cacheHit || previewHit) : (loaded.source === raw && loaded.owner === "" ? loaded.url : ""))
    : raw;
}
