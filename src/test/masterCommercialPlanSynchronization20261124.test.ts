import { describe, expect, it } from "vitest";
import { reconcileInstitutionCommercialPlans, summarizeMasterCommercialContracts, readMunicipalContractQuote } from "@/lib/masterCommercialContract";
import type { ClientPlanAssignment, Institution, PlanItem } from "@/lib/platform";
import type { PlanUsageSnapshot } from "@/lib/planUsageDashboard";
import { resolvePlanEntitlements, planHasModule } from "@/lib/planEntitlements";

const premium: PlanItem = {
  id: "plan-premium",
  accountLevel: "premium",
  name: "Premium",
  subtitle: "Governança ampliada e multi-secretaria",
  price: 4890, billingCycle: "mensal",
  description: "Camada premium",
  badge: "", badgeVariant: "default",
  featuresIncluded: ["Tudo do plano Pro"],
  featuresExcluded: [],
  modulesIncluded: ["Protocolo digital","Analise tecnica","Financeiro","Assinatura","Configurações","Acesso externo"],
  maxUsers: 120, maxProcesses: 5000, maxDepartments: 30, maxStorageGb: 250,
  isFeatured: false, isActive: true, isPublic: true, isInternalOnly: false,
  isCustom: false, isVisibleInMaster: true, displayOrder: 3, accentColor: "#223",
  updatedAt: "2026-11-23T20:00:00Z",
};
const pro: PlanItem = {
  ...premium, id: "plan-pro", name: "Pro", price: 2890,
  maxUsers: 40,maxProcesses: 1200,maxDepartments: 12,maxStorageGb: 80,
  modulesIncluded: premium.modulesIncluded.filter((m) => m !== "Assinatura"),
};
const clp: Institution = {
  id:"49dac0b6-6352-4744-9aab-9ff91c59d970",name:"Prefeitura de Campo Limpo Paulista",
  city:"Campo Limpo Paulista",state:"SP",status:"ativo",plan:"Pro",
  activeModules:[],users:0,processes:0,revenue:0,subdomain:"campolimpopaulista",
  theme:{primary:"#183956",accent:"#216b84"},
};
const other: Institution = {...clp,id:"another-municipality",name:"Outra Prefeitura",plan:"Basic"};
const assignment: ClientPlanAssignment = {
  id:"example-assignment", municipalityId:clp.id, planId: premium.id,
  contractStatus:"ativo",startsAt:"2026-01-10", endsAt:"2027-01-10",
  billingCycle:"mensal", billingNotes:"",customPrice:null,isCustom:false,
  updatedAt:"2026-11-23T22:14:43Z",
};
const live: PlanUsageSnapshot = {
  municipalityId:clp.id,configured:true,contractActive:true,contractReason:"",
  planId:premium.id,planName:"Premium",contractStatus:"ativo",
  limits:{users:120,processes:5000,departments:30,storageGb:250},
  usage:{users:6,processes:3,departments:8,storageBytes:6975553},
};

describe("SIGAPRO — troca de plano e leitura fiel ao contrato oficial", () => {
  it("substitui o nome Pro em catálogos antigos pela assinatura Premium", () => {
    const [updated,untouched] = reconcileInstitutionCommercialPlans({
      institutions:[clp,other],plans:[pro,premium],assignments:[assignment],
    });
    expect(updated.plan).toBe("Premium");
    expect(untouched).toBe(other);
    expect(clp.plan).toBe("Pro");
  });
  it("usa o estado vivo do banco mesmo que o cache do navegador ainda diga Pro", () => {
    const [updated] = reconcileInstitutionCommercialPlans({
      institutions:[clp],plans:[pro,premium],
      assignments:[{...assignment,planId:"plan-pro"}],snapshots:[live],
    });
    expect(updated.plan).toBe("Premium");
    expect(updated.activeModules).toBe(clp.activeModules);
  });
  it("preserva o objeto e os formulários quando não há mudança real de plano", () => {
    const current={...clp,plan:"Premium"};
    const [updated] = reconcileInstitutionCommercialPlans({
      institutions:[current],plans:[premium],assignments:[assignment],snapshots:[live],
    });
    expect(updated).toBe(current);
  });
  it("o Premium libera Assinatura e os 4 limites; o Pro não", () => {
    const state=resolvePlanEntitlements({
      municipalityId:clp.id,plans:[premium,pro],assignments:[assignment],
      now:new Date("2026-11-24T12:00:00Z"),
    });
    expect(state.contractActive).toBe(true);
    expect(planHasModule(state,"Assinatura")).toBe(true);
    expect(state.modules).toHaveLength(6);
    expect([state.maxUsers,state.maxProcesses,state.maxDepartments,state.maxStorageGb])
      .toEqual([120,5000,30,250]);
    const downgraded=resolvePlanEntitlements({
      municipalityId:clp.id,plans:[premium,pro],
      assignments:[{...assignment,planId:"plan-pro"}],
      now:new Date("2026-11-24T12:00:00Z"),
    });
    expect(planHasModule(downgraded,"Assinatura")).toBe(false);
  });
  it("usa o preço e a vigência do contrato efetivo em vez do cadastro antigo", async () => {
    const { readMunicipalContractQuote } = await import("@/lib/masterCommercialContract");
    const quote=readMunicipalContractQuote({
      municipalityId:clp.id,plans:[pro,premium],assignments:[assignment],snapshots:[live],
    });
    expect(quote.plan?.name).toBe("Premium");
    expect(quote.price).toBe(4890);
    expect(quote.billingCycle).toBe("mensal");
    expect(quote.endsAt).toBe("2027-01-10");

    const upgradedWhileCacheOld=readMunicipalContractQuote({
      municipalityId:clp.id,plans:[pro,premium],
      assignments:[{...assignment,planId:"plan-pro",isCustom:true,customPrice:1999}],
      snapshots:[live],
    });
    // Never apply a Pro custom-price override to an unrelated Premium plan.
    expect(upgradedWhileCacheOld.price).toBe(4890);
    const explicit=readMunicipalContractQuote({
      municipalityId:clp.id,plans:[premium],assignments:[{
        ...assignment,isCustom:true,customPrice:3550,
      }],
    });
    expect(explicit.price).toBe(3550);
  });

  it("contabiliza a mensalidade do Premium contratado, não o campo legado zerado", () => {
    expect(summarizeMasterCommercialContracts({
      institutions:[clp,other],plans:[premium,pro],assignments:[assignment],
      now:new Date("2026-11-24T12:00:00Z"),
    })).toEqual({activePlansCount:1,monthlyContractValue:4890});
  });
  it("respeita preço personalizado, prazo, testes e ciclos não mensais", () => {
    const base={institutions:[clp],plans:[premium],now:new Date("2026-11-24T12:00:00Z")};
    expect(summarizeMasterCommercialContracts({...base,assignments:[{
      ...assignment,isCustom:true,customPrice:3600,
    }]}).monthlyContractValue).toBe(3600);
    expect(summarizeMasterCommercialContracts({...base,assignments:[{
      ...assignment,billingCycle:"anual",customPrice:12000,isCustom:true,
    }]}).monthlyContractValue).toBe(1000);
    expect(summarizeMasterCommercialContracts({...base,assignments:[{
      ...assignment,contractStatus:"trial",
    }]})).toEqual({activePlansCount:1,monthlyContractValue:0});
    expect(summarizeMasterCommercialContracts({...base,assignments:[{
      ...assignment,endsAt:"2026-10-01",
    }]})).toEqual({activePlansCount:0,monthlyContractValue:0});
    expect(summarizeMasterCommercialContracts({...base,assignments:[{
      ...assignment,contractStatus:"suspenso",
    }]})).toEqual({activePlansCount:0,monthlyContractValue:0});
  });
});


describe("Sincronização contratual sem reaproveitar dados obsoletos", () => {
  it("não mostra contrato em cache quando o banco confirma que não há configuração", () => {
    const quote = readMunicipalContractQuote({municipalityId:clp.id,plans:[premium],assignments:[assignment],snapshots:[{...live,configured:false,planId:null,planName:null}]});
    expect(quote.plan).toBeNull();
    expect(quote.assignment).toBeNull();
    expect(quote.price).toBeNull();
  });
  it("não mistura vigência ou ciclo antigo com novo plano", () => {
    const quote = readMunicipalContractQuote({municipalityId:clp.id,plans:[premium,pro],assignments:[{...assignment,planId:pro.id,billingCycle:"anual"}],snapshots:[live]});
    expect(quote.plan?.id).toBe(premium.id);
    expect(quote.billingCycle).toBe("mensal");
    expect(quote.endsAt).toBe("");
  });
});
