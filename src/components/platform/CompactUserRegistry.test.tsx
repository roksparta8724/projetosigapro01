import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CompactUserRegistry } from "@/components/platform/CompactUserRegistry";
import type { SessionUser } from "@/lib/platform";

const staff = Array.from({ length: 3000 }, (_, index) => ({
  id: "test-user-" + index,
  name: "Servidor " + String(index + 1).padStart(4, "0"),
  email: "servidor" + index + "@example.gov.br",
  department: index % 2 === 0 ? "Obras" : "Financeiro",
  title: "Analista Técnico",
  role: "analista",
  accessLevel: 1,
  accountStatus: index % 31 === 0 ? "blocked" : "active",
  lastAccessAt: "05/11/2026",
})) as SessionUser[];

function Fixture({ users = staff }: { users?: SessionUser[] }) {
  const [page, setPage] = useState(1);
  return (
    <CompactUserRegistry
      users={users} page={page} onPageChange={setPage} label="Usuários de teste"
      renderDetails={(user) => <p data-testid="expanded-user">Detalhe de {user.name}</p>}
    />
  );
}

describe("SIGAPRO Premium — cadastro escalável de 3 mil usuários", () => {
  it("renderiza somente 20 linhas e nenhuma ficha extensa na carga inicial", () => {
    const { container } = render(<Fixture />);
    expect(screen.getByRole("table", { name: "Usuários de teste" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-sigapro-user-row]")).toHaveLength(20);
    expect(container.querySelectorAll("[data-sigapro-user-expanded]")).toHaveLength(0);
    expect(screen.getByText("3.000")).toBeInTheDocument();
    expect(screen.getByText(/cadastros encontrados/)).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 150/)).toBeInTheDocument();
  });

  it("pagina 3 mil contas sem criar 3 mil cards e sem perder os filtros externos", () => {
    const { container } = render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(container.querySelectorAll("[data-sigapro-user-row]")).toHaveLength(20);
    expect(screen.getByText(/Página 2 de 150/)).toBeInTheDocument();
    expect(screen.getByText("Servidor 0021")).toBeInTheDocument();
    expect(screen.queryByText("Servidor 0001")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText(/Página 1 de 150/)).toBeInTheDocument();
  });

  it("abre somente a ficha consultada e fecha por ação explícita", () => {
    const { container } = render(<Fixture />);
    const details = screen.getAllByRole("button", { name: "Detalhes" });
    fireEvent.click(details[0]);
    expect(container.querySelectorAll("[data-sigapro-user-expanded]")).toHaveLength(1);
    expect(screen.getByTestId("expanded-user")).toHaveTextContent("Servidor 0001");
    fireEvent.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    expect(container.querySelectorAll("[data-sigapro-user-expanded]")).toHaveLength(1);
    expect(screen.getByTestId("expanded-user")).toHaveTextContent("Servidor 0002");
    fireEvent.click(screen.getByRole("button", { name: "Recolher" }));
    expect(container.querySelectorAll("[data-sigapro-user-expanded]")).toHaveLength(0);
  });

  it("permanece legível quando o filtro só retorna um registro e permite lista vazia", () => {
    const { container, rerender } = render(<Fixture users={staff.slice(0, 1)} />);
    expect(container.querySelectorAll("[data-sigapro-user-row]")).toHaveLength(1);
    expect(screen.getByText(/Página 1 de 1/)).toBeInTheDocument();
    rerender(<Fixture users={[]} />);
    expect(container.querySelectorAll("[data-sigapro-user-row]")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum usuário encontrado");
    expect(screen.queryByRole("button", { name: "Próxima" })).not.toBeInTheDocument();
  });

  it("não monta detalhes pesados antes do usuário pedir", () => {
    const heavy = vi.fn((user: SessionUser) => <p>{user.email}</p>);
    const { container } = render(<CompactUserRegistry users={staff} page={1}
      onPageChange={() => {}} renderDetails={heavy} />);
    expect(heavy).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    expect(heavy).toHaveBeenCalled();
    expect(heavy.mock.calls.every(([user]) => user.id === staff[0].id)).toBe(true);
    expect(container.querySelectorAll("[data-sigapro-user-row]")).toHaveLength(20);
  });
});
