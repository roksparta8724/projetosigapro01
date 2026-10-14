import { FileText, Highlighter, MessageSquareText, MousePointer2, ZoomIn } from "lucide-react";

export function DocumentWorkspaceBoot({
  mode = "viewer",
}: {
  mode?: "viewer" | "analysis";
}) {
  const analysis = mode === "analysis";

  return (
    <main
      data-document-workspace-boot="true"
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#dfe5ec]"
    >
      <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-white/10 bg-[linear-gradient(135deg,#071525_0%,#102a43_55%,#123a58_100%)] px-5 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <FileText className="h-5 w-5 text-sky-200" />
          </div>
          <div className="min-w-0">
            <div className="h-2.5 w-28 rounded-full bg-white/20" />
            <div className="mt-2 h-3.5 w-52 max-w-[44vw] rounded-full bg-white/35" />
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <div className="h-9 w-24 rounded-full border border-white/10 bg-white/8" />
          <div className="h-9 w-28 rounded-full border border-white/10 bg-white/8" />
        </div>
      </header>

      <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          {analysis ? (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <MousePointer2 className="h-4 w-4" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-400">
                <Highlighter className="h-4 w-4" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-400">
                <MessageSquareText className="h-4 w-4" />
              </span>
            </>
          ) : (
            <div className="h-9 w-32 rounded-full bg-slate-100" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-full bg-slate-100" />
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <ZoomIn className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 items-center justify-center overflow-hidden bg-[#d8dee6] p-5">
          <div className="flex h-[88%] w-[min(760px,88%)] items-center justify-center rounded-[10px] border border-slate-300 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
            <div className="w-[62%] space-y-4">
              <div className="h-3 w-2/3 rounded-full bg-slate-200" />
              <div className="h-2.5 w-full rounded-full bg-slate-100" />
              <div className="h-2.5 w-11/12 rounded-full bg-slate-100" />
              <div className="h-2.5 w-5/6 rounded-full bg-slate-100" />
              <div className="mt-8 h-28 rounded-xl bg-slate-50" />
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-slate-200 bg-white p-5 xl:block">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="mt-5 space-y-3">
            <div className="h-20 rounded-2xl bg-slate-100" />
            <div className="h-28 rounded-2xl bg-slate-100" />
            <div className="h-36 rounded-2xl bg-slate-100" />
          </div>
        </aside>
      </div>
    </main>
  );
}
