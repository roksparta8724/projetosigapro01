/**
 * QA-only live negative smoke checks: no account tokens, personal records, uploads
 * or mutations. The Neon function is intentionally pinned to the isolated branch.
 * A 2xx from an unauthenticated object operation is a critical failure.
 */
const base = "https://br-solitary-sound-b4xlbvs6-sigaproqa.compute.c-6.us-east-2.aws.neon.tech";
const previewOrigin = "https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
const officialOrigin = "https://sigapromunicipal.com.br";

async function probe(label, path, options, expected, extra) {
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    throw new Error(label + ": QA function unreachable (" +
      (error instanceof Error ? error.name : "unknown transport error") + ")");
  }
  if (response.status !== expected || (extra && !extra(response))) {
    throw new Error(label + ": unexpected status/headers " + response.status);
  }
  console.log("PASS " + label + " (" + response.status + ")");
}

await probe("upload requires JWT", "/upload", { method: "POST" }, 401);
await probe("read requires JWT", "/read", { method: "GET" }, 401);
await probe("delete requires JWT", "/object", { method: "DELETE" }, 401);
await probe("official origin refused", "/upload", {
  method: "OPTIONS", headers: { Origin: officialOrigin },
}, 403, r => !r.headers.has("access-control-allow-origin"));
await probe("QA preview preflight allowed", "/upload", {
  method: "OPTIONS", headers: { Origin: previewOrigin },
}, 204, r => r.headers.get("access-control-allow-origin") === previewOrigin);
// An immutable preview's hostname changes on each Vercel build, unlike the
// branch alias. Verify the REAL deployed QA function's CORS, not just mocks.
const immutableQaOrigin="https://projetosigapro01-1wgk0b4a2-roksparta8724s-projects.vercel.app";
await probe("SIGAPRO immutable QA preview preflight allowed", "/upload",{
  method:"OPTIONS",headers:{Origin:immutableQaOrigin}
},204,r=>r.headers.get("access-control-allow-origin")===immutableQaOrigin);
for(const origin of [
  "https://otherproject-1wgk0b4a2-roksparta8724s-projects.vercel.app",
  "https://projetosigapro01-1wgk0b4a2-fake-projects.vercel.app",
  "https://projetosigapro01-1wgk0b4a2-roksparta8724s-projects.vercel.app.attacker.test",
]) {
  await probe("forged immutable QA preview must be rejected", "/upload",{
    method:"OPTIONS",headers:{Origin:origin}
  },403,r=>!r.headers.has("access-control-allow-origin"));
}
await probe("invalid private key rejected before storage access",
  "/upload?objectKey=" + encodeURIComponent("../../secret.pdf"), {
    method: "POST", headers: { Authorization: "Bearer synthetic-qa-negative-test" },
  }, 400);
// The new QA photo routes must reject forged sessions before attempting any
// S3 write, even when the extension and Content-Type are legitimate.
for(const extension of ["jpg","png","webp"]) {
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/vistoria."+extension;
  const mime=extension==="jpg"?"image/jpeg":"image/"+extension;
  await probe("image upload forbids forged JWT ("+extension+")",
    "/upload?objectKey="+encodeURIComponent(key), {
      method:"POST",
      headers:{Authorization:"Bearer deliberately-invalid-qa-smoke","Content-Type":mime},
    },403);
}
await probe("SVG storage key forbidden before RPC",
  "/upload?objectKey="+encodeURIComponent("municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/fake.svg"),{
    method:"POST",headers:{Authorization:"Bearer deliberately-invalid-qa-smoke","Content-Type":"image/svg+xml"}
  },400);
await probe("recovery list requires JWT", "/list-user-files",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
},401);
await probe("invalid recovery process rejected before storage", "/list-user-files",{
  method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer synthetic-qa-negative-test"},
  body:JSON.stringify({processId:"not-a-uuid"}),
},400);
console.log("SIGAPRO QA Neon Function live negative smoke checks passed.");
