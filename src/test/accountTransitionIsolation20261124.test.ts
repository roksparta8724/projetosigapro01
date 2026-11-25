import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path:string) => readFileSync(path,"utf8");
describe("account transition isolation",()=>{
  it("serializes remote logout and the next login without releasing on a timeout",()=>{
    const bootstrap=read("src/hooks/useAppBootstrap.tsx");
    expect(bootstrap).toContain("await remoteSignOutRef.current");
    expect(bootstrap).toContain("remoteSignOutRef.current = remoteTask");
    expect(bootstrap).toContain("const signInEpoch = ++bootstrapEpochRef.current");
    expect(bootstrap).toContain("lastAuthUserIdRef.current === data.user.id");
    const logout=bootstrap.slice(bootstrap.lastIndexOf("signOut: async () => {"));
    expect(logout).not.toContain("Promise.race");
    expect(logout).toContain("await remoteTask");
  });
  it("clears the old identity before the next login and never signs out from a stale data request",()=>{
    const gateway=read("src/hooks/useAuthGateway.tsx");
    expect(gateway.indexOf("const signOutTask = bootstrap.signOut()")).toBeLessThan(gateway.indexOf("await signOutTask"));
    expect(gateway.indexOf("clearAuthorizedAvatarRuntimeCache();")).toBeLessThan(gateway.indexOf("await signOutTask"));
    const data=read("src/hooks/usePlatformData.tsx");
    expect(data).not.toContain("await backendClient.auth.signOut()");
    expect(data).toContain("currentAuthIdentityRef.current !== authenticatedUserId");
    const session=read("src/hooks/usePlatformSession.tsx");
    expect(session).toContain("!businessUserId && (isNeonBackend || !authResolved)");
    expect(session).toContain("readCachedSession()?.id === cachedSession.id");
    const route=read("src/components/platform/PermissionRoute.tsx");
    expect(route.indexOf("if (!isAuthenticated && bootstrap.authResolved && bootstrap.isReady)")).toBeLessThan(route.indexOf("if (isInitialAccessResolution)"));
  });
});
