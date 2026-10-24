#!/usr/bin/env node
// SIGAPRO — verification of the isolated QA release gates using GitHub Actions API.
// Read-only. No database credentials, mutation, deployment or production changes.
const repository = process.env.GITHUB_REPOSITORY || "roksparta8724/projetosigapro01";
const branch = "qa/sigapro-ia-logo-integrado-20261023";
const api = "https://api.github.com/repos/" + repository;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "sigapro-urban-qa-readiness" };
if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
async function fetchJson(path) {
  const response = await fetch(api + path, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("GitHub API " + response.status + " — " + path);
  return response.json();
}
async function main() {
  const branchInfo = await fetchJson("/branches/" + encodeURIComponent(branch));
  const head = branchInfo.commit.sha;
  const workflows = [
    "SIGAPRO Quality Gate",
    "Neon migration validation",
  ];
  const runs = await fetchJson("/actions/runs?branch=" + encodeURIComponent(branch) + "&per_page=100");
  const report = workflows.map(name => {
    const selected = runs.workflow_runs.find(run => run.name === name && run.head_sha === head);
    return { name, status: selected?.status || "missing", conclusion: selected?.conclusion || null,
      url: selected?.html_url || null, head };
  });
  for (const result of report) console.log(JSON.stringify(result));
  if (report.some(result => result.conclusion !== "success")) {
    console.error("BLOQUEADO: ambas as verificacoes devem passar no MESMO commit HEAD.");
    process.exitCode = 1;
  } else {
    console.log("APROVADO: os dois pipelines correspondem ao HEAD " + head);
    console.log("AVISO: esta verificacao NAO substitui teste autenticado no Neon isolado.");
  }
}
main().catch(error => { console.error("Falha na verificacao:", error.message); process.exitCode = 1; });
