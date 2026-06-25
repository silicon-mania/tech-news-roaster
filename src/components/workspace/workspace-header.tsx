import Image from "next/image";

type WorkspaceHeaderProps = {
  compact?: boolean;
};

const LOGO_SRC = "/assets/logo/logo.png";

export function WorkspaceHeader({ compact = false }: WorkspaceHeaderProps) {
  if (compact) {
    return (
      <header className="flex items-center justify-center gap-2.5 pt-2">
        <Image
          src={LOGO_SRC}
          alt=""
          aria-hidden
          width={32}
          height={32}
          className="size-7 rounded-lg sm:size-8"
        />
        <h1 className="display-locked text-2xl text-foreground sm:text-3xl">Auto-news</h1>
      </header>
    );
  }

  return (
    <header className="grid justify-items-center gap-4 pt-6 text-center sm:pt-10">
      <Image
        src={LOGO_SRC}
        alt="Auto-news logo"
        width={72}
        height={72}
        priority
        className="size-16 rounded-2xl shadow-lg shadow-black/30 sm:size-[72px]"
      />
      <div className="grid gap-2">
        <h1 className="display-locked text-4xl text-foreground sm:text-6xl">Auto-news</h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          generate the next Viral Quote Tweet based on a news
        </p>
      </div>
    </header>
  );
}
