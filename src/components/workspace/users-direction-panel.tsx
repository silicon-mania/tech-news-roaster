"use client";

import { Textarea } from "@/components/ui/textarea";

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
        <p className="editorial-serif text-foreground text-xl">User&apos;s Direction</p>
        <p className="mt-1 text-muted-foreground text-xs uppercase tracking-[0.16em]">Optional</p>
      </div>
      <Textarea
        aria-label="User's Direction"
        name="usersDirection"
        value={usersDirection}
        onChange={(event) => onUsersDirectionChange(event.target.value)}
        placeholder="Add context to respect, a constraint, or a line you want challenged."
        className="min-h-52 resize-y rounded-md border-transparent bg-card/80 px-4 py-3 leading-7 md:text-base dark:bg-card/80"
      />
    </div>
  );
}
