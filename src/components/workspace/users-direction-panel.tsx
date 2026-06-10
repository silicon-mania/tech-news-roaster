"use client";

type UsersDirectionPanelProps = {
  usersDirection: string;
  onUsersDirectionChange: (usersDirection: string) => void;
};

export function UsersDirectionPanel({
  usersDirection,
  onUsersDirectionChange,
}: UsersDirectionPanelProps) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="editorial-serif text-slate-100 text-xl">User&apos;s Direction</p>
        <p className="mt-1 text-slate-500 text-xs uppercase tracking-[0.16em]">Optional</p>
      </div>
      <textarea
        aria-label="User's Direction"
        name="usersDirection"
        value={usersDirection}
        onChange={(event) => onUsersDirectionChange(event.target.value)}
        placeholder="Add context to respect, a constraint, or a line you want challenged."
        className="min-h-52 w-full resize-y rounded-sm border border-slate-800/90 bg-slate-950/70 px-4 py-3 text-base text-slate-100 leading-7 outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20"
      />
    </div>
  );
}
