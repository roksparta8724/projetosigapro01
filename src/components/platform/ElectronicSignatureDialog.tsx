import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck, Signature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ElectronicSignatureDialog({
  open,
  onOpenChange,
  title,
  subject,
  statement,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject: string;
  statement: string;
  busy?: boolean;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      setAccepted(false);
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (!password) {
      setError("Digite sua senha de acesso para confirmar a assinatura.");
      return;
    }
    if (!accepted) {
      setError("Confirme que você reconhece o conteúdo e a finalidade da assinatura.");
      return;
    }

    setError("");
    try {
      await onConfirm(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível registrar a assinatura eletrônica.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-[560px] overflow-hidden rounded-[28px] border-slate-200 bg-white p-0 shadow-2xl">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_55%,#0c4a6e_100%)] px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/15 bg-white/10">
              <Signature className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-white">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-200">
              {subject}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-[18px] border border-sky-200 bg-sky-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Assinatura eletrônica autenticada pelo SIGAPRO</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  A assinatura ficará vinculada à sua conta, ao conteúdo assinado e ao processo por hash SHA-256, data/hora oficial e código de verificação.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Declaração de assinatura</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{statement}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sigapro-signature-password" className="flex items-center gap-2 text-slate-900">
              <LockKeyhole className="h-4 w-4 text-slate-500" />
              Senha de acesso *
            </Label>
            <Input
              id="sigapro-signature-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="h-12 rounded-[16px]"
              placeholder="Digite a mesma senha usada para entrar no SIGAPRO"
              disabled={busy}
            />
            <p className="text-xs leading-5 text-slate-500">
              Sua senha é enviada somente ao provedor de autenticação para revalidar sua identidade. O SIGAPRO não grava a senha no processo nem na assinatura.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-slate-200 bg-white p-4">
            <Checkbox
              checked={accepted}
              onCheckedChange={(value) => setAccepted(value === true)}
              className="mt-0.5"
              disabled={busy}
            />
            <span className="text-sm leading-6 text-slate-700">
              Reconheço o conteúdo acima e confirmo que desejo assiná-lo eletronicamente com minha identidade de acesso ao SIGAPRO.
            </span>
          </label>

          {error ? (
            <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <KeyRound className="h-3.5 w-3.5" />
            Cada operação de assinatura exige nova confirmação de senha. Quando a tela declarar um lote, a confirmação vale somente para os itens explicitamente informados naquele ato.
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full bg-slate-950 px-6 !text-white hover:bg-slate-900"
            onClick={() => void submit()}
            disabled={busy}
          >
            <Signature className="mr-2 h-4 w-4" />
            {busy ? "Confirmando identidade..." : "Assinar eletronicamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
