export function WorkspaceHeader() {
  return (
    <header className="flex flex-col justify-between gap-3 border-slate-800 border-b pb-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 font-medium text-sky-300 text-sm">
          Source Tweet intake
        </p>
        <h1 className="font-semibold text-3xl tracking-normal sm:text-4xl">
          Tech News Roaster
        </h1>
      </div>
      <p className="max-w-sm text-slate-400 text-sm">
        One Source Tweet, one freeform steer, three drafts next.
      </p>
    </header>
  );
}
