"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import type { JokeContextSnapshot } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { TextRevealModal } from "./text-reveal-modal";

export function QuietRunReveals({ run }: { run: GenerationRun }) {
  const [isContextOpen, setIsContextOpen] = useState(false);
  const jokeContextSnapshot = getJokeContextSnapshot(run);

  if (!jokeContextSnapshot) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {jokeContextSnapshot ? (
        <button
          type="button"
          aria-label="Open Joke Context Snapshot"
          onClick={() => setIsContextOpen(true)}
          className="inline-flex h-8 items-center gap-2 rounded-sm border border-slate-800 bg-slate-950/45 px-2.5 text-slate-400 text-xs transition hover:border-slate-600 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
          <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          Context
        </button>
      ) : null}
      {isContextOpen && jokeContextSnapshot ? (
        <TextRevealModal
          label="Joke Context Snapshot"
          title="Joke Context Snapshot"
          onClose={() => setIsContextOpen(false)}>
          <JokeContextSnapshotDetails snapshot={jokeContextSnapshot} />
        </TextRevealModal>
      ) : null}
    </div>
  );
}

function JokeContextSnapshotDetails({ snapshot }: { snapshot: JokeContextSnapshot }) {
  const context = snapshot.structuredContext;
  const sections = [
    {
      title: "Source Tweet Claim",
      content: context.sourceTweetClaim,
    },
    {
      title: "Source Tweet Media Extraction",
      content: [
        context.sourceTweetMediaExtraction.summary,
        ...context.sourceTweetMediaExtraction.visibleText.map((text) => `Visible text: ${text}`),
        ...context.sourceTweetMediaExtraction.notableDetails.map((detail) => `Detail: ${detail}`),
        `Media kinds: ${context.sourceTweetMediaExtraction.mediaKinds.join(", ")}`,
      ],
    },
    {
      title: "Author Context",
      content: [
        `${context.authorContext.displayName} (${context.authorContext.handle})`,
        context.authorContext.role ? `Role: ${context.authorContext.role}` : null,
        context.authorContext.relationshipToTopic,
        ...context.authorContext.authoritySignals,
      ].filter((line): line is string => Boolean(line)),
    },
    {
      title: "Reply Signals",
      content: [
        context.replySignals.summary,
        ...context.replySignals.representativeSnippets.map((reply) =>
          [reply.authorHandle, reply.signal, reply.snippet].filter(Boolean).join(" - "),
        ),
      ],
    },
    {
      title: "Supporting Facts",
      content: context.supportingFacts,
    },
    {
      title: "Unknowns",
      content: context.unknowns,
    },
    {
      title: "Jokeable Tensions",
      content: context.jokeableTensions,
    },
    {
      title: "Forbidden Assumptions",
      content: context.forbiddenAssumptions,
    },
    {
      title: "Joke Context Quality",
      content: `${context.jokeContextQuality.status}: ${context.jokeContextQuality.summary}`,
    },
  ];

  return (
    <div className="grid gap-3">
      <p className="text-slate-500 text-xs">
        Source tweet {snapshot.sourceTweetId} - {snapshot.capturedAt}
      </p>
      {sections.map((section) => (
        <section
          aria-label={section.title}
          className="grid gap-2 rounded-sm border border-white/8 bg-slate-950/45 p-3"
          key={section.title}>
          <h2 className="font-medium text-slate-100 text-sm">{section.title}</h2>
          {Array.isArray(section.content) ? (
            <ul className="grid gap-1.5 text-slate-300 text-sm leading-6">
              {section.content.map((item) => (
                <li className="break-words" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="break-words text-slate-300 text-sm leading-6">{section.content}</p>
          )}
        </section>
      ))}
    </div>
  );
}

function getJokeContextSnapshot(run: GenerationRun) {
  if (run.jokeContextSnapshot) {
    return run.jokeContextSnapshot;
  }

  const contextGathering = run.generationResultStates?.contextGathering;

  if (contextGathering?.status === "completed") {
    return contextGathering.jokeContextSnapshot;
  }

  return undefined;
}
