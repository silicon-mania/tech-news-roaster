type WorkspaceHeaderProps = {
  compact?: boolean;
};

export function WorkspaceHeader({ compact = false }: WorkspaceHeaderProps) {
  return (
    <header
      className={`grid justify-items-center text-center ${compact ? "pt-2" : "pt-6 sm:pt-10"}`}>
      <h1
        className={`editorial-serif text-foreground tracking-normal ${
          compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl"
        }`}>
        TECH NEWS ROASTER
      </h1>
    </header>
  );
}
