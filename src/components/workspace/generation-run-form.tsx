import { AlignLeft, ArrowRight, Menu } from "lucide-react";
import { type FormEvent, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SubmissionState } from "@/services/workspace";

type GenerationRunFormProps = {
  hasRuns: boolean;
  hasUsersDirection: boolean;
  isRunDisabled: boolean;
  runtimeNotice?: {
    kind: "blocked" | "warning";
    message: string;
  };
  runsCount: number;
  sourceTweetUrl: string;
  submissionState: SubmissionState;
  onOpenDirectionPanel: () => void;
  onOpenRunsDrawer: () => void;
  onSourceTweetUrlChange: (sourceTweetUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function GenerationRunForm({
  hasRuns,
  hasUsersDirection,
  isRunDisabled,
  runtimeNotice,
  runsCount,
  sourceTweetUrl,
  submissionState,
  onOpenDirectionPanel,
  onOpenRunsDrawer,
  onSourceTweetUrlChange,
  onSubmit,
}: GenerationRunFormProps) {
  const sourceTweetUrlId = useId();
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const statusId = `${sourceTweetUrlId}-status`;
  const runtimeNoticeId = `${sourceTweetUrlId}-runtime-notice`;
  const visibleRuntimeNotice = submissionState.kind === "idle" ? runtimeNotice : undefined;
  const sourceTweetUrlDescription = [
    submissionState.kind === "invalid" ? sourceTweetUrlErrorId : null,
    submissionState.kind === "accepted" || submissionState.kind === "blocked" ? statusId : null,
    visibleRuntimeNotice ? runtimeNoticeId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-label={hasRuns ? "Compressed source tweet bar" : "Primary source tweet bar"}
      className={`mx-auto grid w-full max-w-3xl gap-3 transition-[max-width] duration-300 ${
        hasRuns ? "sm:max-w-2xl" : ""
      }`}>
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-md bg-card/85 p-2 shadow-2xl shadow-black/25 backdrop-blur sm:grid-cols-[3rem_minmax(0,1fr)_auto_3rem]">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Open runs drawer, ${runsCount} runs`}
                className="justify-self-center text-muted-foreground"
                onClick={onOpenRunsDrawer}
                size="icon"
                type="button"
                variant="ghost"
              />
            }>
            <Menu aria-hidden className="size-3.5" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>Runs</TooltipContent>
        </Tooltip>

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
            className="h-11 rounded-md border-transparent bg-secondary/60 px-3 placeholder:text-muted-foreground/60 sm:px-4 md:text-base dark:bg-secondary/60"
          />
        </div>

        <Button
          type="submit"
          aria-describedby={visibleRuntimeNotice ? runtimeNoticeId : undefined}
          disabled={isRunDisabled}
          className="col-span-3 row-start-2 h-11 gap-2 px-3 font-semibold sm:col-auto sm:row-auto sm:px-4">
          <ArrowRight aria-hidden className="size-4" strokeWidth={1.75} />
          <span>Run</span>
        </Button>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Open user's direction panel"
                className="relative col-start-3 row-start-1 justify-self-center text-muted-foreground sm:col-auto sm:row-auto"
                onClick={onOpenDirectionPanel}
                size="icon"
                type="button"
                variant="ghost"
              />
            }>
            <AlignLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
            {hasUsersDirection ? (
              <span
                title="User's Direction has content"
                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
              />
            ) : null}
          </TooltipTrigger>
          <TooltipContent>User's direction</TooltipContent>
        </Tooltip>
      </form>

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
