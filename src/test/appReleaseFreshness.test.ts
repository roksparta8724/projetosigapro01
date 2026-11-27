// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { hasNewPublishedAppRelease, readAppReleaseSignature } from "@/lib/appReleaseFreshness";
const origin = "https://sigapromunicipal.com.br";
const html = (js: string, css = "style-A") => '<html><head><meta name="sigapro-static-app-document" content="v1"><script type="module" src="/assets/'+js+'.js"></script><link rel="stylesheet" href="/assets/'+css+'.css"></head><body><div id="root"></div></body></html>';
const doc = (s: string) => new DOMParser().parseFromString(s,"text/html");
const response = (s: string) => ({ ok:true, redirected:false, headers:{get:()=> "text/html; charset=utf-8"}, text:async()=>s }) as unknown as Response;
describe("published release freshness",()=>{
  it("recognizes new JS or CSS release while keeping the same release in place",async()=>{
    const current=doc(html("index-A"));
    const request=vi.fn(async()=>response(html("index-B")));
    expect(await hasNewPublishedAppRelease(current,origin,request as typeof fetch)).toBe(true);
    expect(request).toHaveBeenCalledWith(origin+"/index.html",expect.objectContaining({cache:"no-store",credentials:"same-origin"}));
    expect(await hasNewPublishedAppRelease(current,origin,vi.fn(async()=>response(html("index-A","style-B"))) as typeof fetch)).toBe(true);
    expect(await hasNewPublishedAppRelease(current,origin,vi.fn(async()=>response(html("index-A"))) as typeof fetch)).toBe(false);
  });
  it("ignores unverified HTML, another origin and network failures",async()=>{
    const current=doc(html("index-A"));
    expect(readAppReleaseSignature(doc('<div id="root"></div>'),origin)).toBe("");
    expect(readAppReleaseSignature(doc(html("index-A").replace('/assets/index-A.js','https://other.example/assets/index-A.js')),origin)).toBe("");
    expect(await hasNewPublishedAppRelease(current,origin,vi.fn(async()=>response("<html>login</html>")) as typeof fetch)).toBe(false);
    expect(await hasNewPublishedAppRelease(current,origin,vi.fn(async()=>{throw Error("offline")}) as typeof fetch)).toBe(false);
  });
});
