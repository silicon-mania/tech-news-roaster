import Image from "next/image";

export function SourceTweetPreview({ text }: { text: string }) {
  return (
    <aside
      aria-label="Source Tweet Preview"
      className="top-2 z-10 mx-auto mb-6 max-w-3xl px-3.5 shadow-black/30 shadow-lg backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-card p-1.5">
          <Image
            alt=""
            aria-hidden
            className="h-full w-full object-contain"
            height={28}
            src="/assets/x-light.png"
            width={28}
          />
        </span>
        <div className="grid min-w-0 gap-1">
          <p className="text-muted-foreground text-xs">Source post</p>
          <p className="line-clamp-2 wrap-break-word text-foreground/90 text-sm leading-6">
            {text}
          </p>
        </div>
      </div>
    </aside>
  );
}
