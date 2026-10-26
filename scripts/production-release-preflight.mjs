/** Read-only production migration inventory. NEVER applies SQL, deploys, or calls Neon. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const dir=join(root,"neon","migrations");
const financial=[
 "20261017_payment_guide_banking_fields.sql",
 "20261026_prod_collection_guide_snapshot_v1.sql",
 "20261021_dam_original_and_provider_persistence.sql",
 "20261026_dam_original_archive_access_alignment.sql",
 "20261026_dam_boleto_optional_pix_fix.sql",
 "20261026_prod_dam_collection_mode_guard_v1.sql",
];
const pendingSeparateReview=[
 "20261021_municipal_collection_configuration.sql",
 "20261023_repair_municipal_collection_schema_production.sql",
 "20261023_urban_ai_rule_versions_and_prechecks_v1.sql",
 "20261023_urban_ai_legal_evidence_catalog_v1.sql",
 "20261023_urban_ai_reference_date_history_v2.sql",
 "20261024_urban_ai_conditional_review_v3.sql",
 "20261024_urban_legal_scope_binding_v4.sql",
 "20261024_urban_scanned_source_audit_v5.sql",
 "20261024_urban_browser_ocr_audit_v6.sql",
 "20261023_urban_reference_civil_day_v7.sql",
 "20261024_prevent_legacy_process_identity_spoofing.sql",
];
const qaMarker=/--[^\n]*(QA[- ]only|isolated QA only|QA exclusive|somente (?:na |em )?QA|exclusivament[eo] (?:na |em )?QA|n[aã]o executar em produ[cç][aã]o|never (?:deploy|apply|execute) (?:in|to) production)/i;
const errors=[];
for(const name of [...financial,...pendingSeparateReview]){
 if(!/^[0-9]{8}_[\w-]+\.sql$/.test(name)||!existsSync(join(dir,name)))errors.push("Missing/invalid migration "+name);
}
for(const name of financial){
 if(!existsSync(join(dir,name)))continue;
 const s=readFileSync(join(dir,name),"utf8");
 if(name.includes("_qa_")||qaMarker.test(s.slice(0,900)))errors.push("QA-only SQL selected: "+name);
 if(/\bcurrent_database\s*\(/i.test(s))errors.push("Database name is NOT a Neon branch identity: "+name);
 if(/\b(drop table|truncate table|delete from public\.payment_guides)\b/i.test(s))errors.push("Potentially destructive SQL: "+name);
}
const excluded=readdirSync(dir).filter(n=>n.endsWith(".sql")&&(n.includes("_qa_")||qaMarker.test(readFileSync(join(dir,n),"utf8").slice(0,900))));
for(const n of excluded)if(financial.includes(n))errors.push("Excluded SQL selected: "+n);
if(errors.length){
 console.error("RELEASE INVENTORY FAILED");
 errors.forEach(x=>console.error("- "+x));
 process.exitCode=1;
}else{
 console.log("FINANCIAL MIGRATIONS VALID FOR REVIEW ONLY - NOT APPROVED FOR PRODUCTION");
 financial.forEach((f,i)=>console.log((i+1)+". "+f));
 console.log("QA-only migrations excluded: "+excluded.length);
 console.log("Additional urban/collection/security migrations requiring independent review: "+pendingSeparateReview.length);
 console.log("RELEASE BLOCKED: Production catalog, live bank E2E, archived SHA PDF, two municipal workflows, exact SHA preview and user approval.");
}
