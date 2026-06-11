import { ArrowRight, ChevronDown } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SubmissionState } from "@/services/workspace";

type GenerationRunFormProps = {
  hasRuns: boolean;
  isRunDisabled: boolean;
  runtimeNotice?: {
    kind: "blocked" | "warning";
    message: string;
  };
  sourceTweetUrl: string;
  submissionState: SubmissionState;
  usersDirection: string;
  onSourceTweetUrlChange: (sourceTweetUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsersDirectionChange: (usersDirection: string) => void;
};

export function GenerationRunForm({
  hasRuns,
  isRunDisabled,
  runtimeNotice,
  sourceTweetUrl,
  submissionState,
  usersDirection,
  onSourceTweetUrlChange,
  onSubmit,
  onUsersDirectionChange,
}: GenerationRunFormProps) {
  const sourceTweetUrlId = useId();
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const statusId = `${sourceTweetUrlId}-status`;
  const runtimeNoticeId = `${sourceTweetUrlId}-runtime-notice`;
  const directionId = `${sourceTweetUrlId}-direction`;
  const hasUsersDirection = usersDirection.trim().length > 0;
  const [isDirectionOpen, setIsDirectionOpen] = useState(hasUsersDirection);
  const visibleRuntimeNotice = submissionState.kind === "idle" ? runtimeNotice : undefined;
  const sourceTweetUrlDescription = [
    submissionState.kind === "invalid" ? sourceTweetUrlErrorId : null,
    submissionState.kind === "accepted" || submissionState.kind === "blocked" ? statusId : null,
    visibleRuntimeNotice ? runtimeNoticeId : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Auto-reveal the direction whenever it carries content (e.g. reopening a
  // saved run), while leaving a manual collapse of an empty field untouched.
  useEffect(() => {
    if (hasUsersDirection) {
      setIsDirectionOpen(true);
    }
  }, [hasUsersDirection]);

  return (
    <section
      aria-label={hasRuns ? "Compressed source tweet bar" : "Primary source tweet bar"}
      className={`mx-auto grid w-full max-w-3xl gap-3 transition-[max-width] duration-300 ${
        hasRuns ? "sm:max-w-2xl" : ""
      }`}>
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-card/85 p-2 shadow-2xl shadow-black/25 backdrop-blur">
        <div className="min-w-0">
          <label htmlFor={sourceTweetUrlId} className="sr-only">
            Source Tweet URL
          </label>
          <Input
            id={sourceTweetUrlId}
            name="sourceTweetUrl"
            value={sourceTweetUrl}
            onChange={(event) => onSourceTweetUrlChange(event.target.value)}
            aria-describedby={sourceTweetUrlDescription || undefined}
            aria-invalid={submissionState.kind === "invalid"}
            placeholder="https://x.com/handle/status/1234567890"
            className="h-11 rounded-md border-transparent bg-transparent px-3 placeholder:text-muted-foreground/40 sm:px-4 md:text-base dark:bg-transparent"
          />
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-describedby={visibleRuntimeNotice ? runtimeNoticeId : undefined}
                aria-label="Run"
                className="size-11 rounded-full"
                disabled={isRunDisabled}
                size="icon"
                type="submit"
              />
            }>
            <ArrowRight aria-hidden className="size-4" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>Run</TooltipContent>
        </Tooltip>
      </form>

      <div className="grid gap-2 px-2">
        <Button
          aria-controls={directionId}
          aria-expanded={isDirectionOpen}
          className="h-auto w-fit gap-1.5 px-1.5 py-1 font-normal text-muted-foreground text-sm hover:bg-transparent hover:text-foreground"
          onClick={() => setIsDirectionOpen((open) => !open)}
          size="sm"
          type="button"
          variant="ghost">
          <ChevronDown
            aria-hidden
            className={`size-3.5 transition-transform ${isDirectionOpen ? "" : "-rotate-90"}`}
            strokeWidth={1.75}
          />
          <span>{isDirectionOpen ? "Hide direction" : "Add direction"}</span>
          {!isDirectionOpen && hasUsersDirection ? (
            <span
              title="User's Direction has content"
              className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>

        {isDirectionOpen ? (
          <Textarea
            id={directionId}
            aria-label="User's Direction"
            name="usersDirection"
            value={usersDirection}
            onChange={(event) => onUsersDirectionChange(event.target.value)}
            placeholder="Add context: what to respect, avoid, tone, angle, or length. This only affects the 3 text drafts, not the joke or image (optional)"
            className="min-h-28 resize-y rounded-md border-transparent bg-card/80 px-4 py-3 leading-7 placeholder:text-muted-foreground/40 md:text-base dark:bg-card/80"
          />
        ) : null}
      </div>

      <div className="min-h-5 px-2">
        {submissionState.kind === "invalid" ? (
          <p
            id={sourceTweetUrlErrorId}
            role="alert"
            className="text-center text-destructive text-sm leading-5">
            {submissionState.message}
          </p>
        ) : null}
        {submissionState.kind === "accepted" ? (
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="text-center text-sm text-success leading-5">
            Run started.
          </p>
        ) : null}
        {submissionState.kind === "blocked" ? (
          <p
            id={statusId}
            role="status"
            className="text-center text-muted-foreground text-sm leading-5">
            {submissionState.message}
          </p>
        ) : null}
        {visibleRuntimeNotice ? (
          <p
            id={runtimeNoticeId}
            role={visibleRuntimeNotice.kind === "blocked" ? "status" : undefined}
            className={`text-center text-sm leading-5 ${
              visibleRuntimeNotice.kind === "warning" ? "text-warning" : "text-muted-foreground"
            }`}>
            {visibleRuntimeNotice.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
