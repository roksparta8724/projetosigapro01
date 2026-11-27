// @vitest-environment jsdom
import {render,screen,act} from "@testing-library/react";
import {describe,it,expect,vi} from "vitest";
import {SecureRoutePending} from "@/components/platform/SecureRoutePending";
import {MunicipalTransitionSurface} from "@/components/platform/MunicipalTransitionSurface";
describe("Transição discreta e segura",()=>{
 it("não exibe alerta transitório durante a abertura de uma conta",()=>{
 vi.useFakeTimers();try{render(<SecureRoutePending/>);expect(screen.queryByRole("alert")).not.toBeInTheDocument();expect(screen.getByRole("status")).toBeInTheDocument();act(()=>vi.advanceTimersByTime(12000));expect(screen.getByRole("alert")).toBeVisible();}finally{vi.useRealTimers();}
 });
 it("não apresenta card de sincronização ao trocar departamento",()=>{
 render(<MunicipalTransitionSurface departmentName="TI"/>);expect(screen.queryByRole("alert")).not.toBeInTheDocument();expect(screen.getByRole("status")).toBeInTheDocument();
 });
 it("não esconde falhas confirmadas",()=>{render(<SecureRoutePending failed detail="Autenticação não concluída."/>);expect(screen.getByRole("alert")).toBeVisible();expect(screen.getByText("Autenticação não concluída.")).toBeVisible();});
});
