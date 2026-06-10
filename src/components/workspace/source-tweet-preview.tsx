import Image from "next/image";

export function SourceTweetPreview({ text }: { text: string }) {
  return (
    <aside
      aria-label="Source Tweet Preview"
      className="top-2 z-10 px-3.5 mb-6 shadow-lg shadow-black/30 backdrop-blur-sm max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-slate-950/90 p-1.5">
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
          <p className="text-xs text-slate-500">Source post</p>
          <p className="line-clamp-2 wrap-break-word text-slate-200 text-sm leading-6">{text}</p>
        </div>
      </div>
    </aside>
  );
}
