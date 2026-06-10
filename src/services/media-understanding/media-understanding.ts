import { z } from "zod";
import {
  parseSourceTweetMediaExtraction,
  type SourceTweetMediaExtraction,
  sourceTweetMediaExtractionSchema,
} from "@/services/generation/generation-events";
import { type RetrievedSourceTweet, sourceTweetMediaKindSchema } from "@/services/tweet-retrieval";

const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

const sourceTweetMediaReadBaseSchema = z
  .object({
    kind: sourceTweetMediaKindSchema,
    mediaReferenceId: nonEmptyTrimmedStringSchema,
  })
  .strict();

const completedSourceTweetMediaReadSchema = sourceTweetMediaReadBaseSchema
  .extend({
    status: z.literal("completed"),
    summary: nonEmptyTrimmedStringSchema,
    visibleText: z.array(nonEmptyTrimmedStringSchema),
    notableDetails: z.array(nonEmptyTrimmedStringSchema),
  })
  .strict();

const unavailableSourceTweetMediaReadSchema = sourceTweetMediaReadBaseSchema
  .extend({
    status: z.literal("unavailable"),
    reason: nonEmptyTrimmedStringSchema,
  })
  .strict();

const failedSourceTweetMediaReadSchema = sourceTweetMediaReadBaseSchema
  .extend({
    status: z.literal("failed"),
    message: nonEmptyTrimmedStringSchema,
  })
  .strict();

const sourceTweetMediaReadSchema = z.discriminatedUnion("status", [
  completedSourceTweetMediaReadSchema,
  unavailableSourceTweetMediaReadSchema,
  failedSourceTweetMediaReadSchema,
]);

const sourceTweetMediaUnderstandingStatusSchema = z.enum([
  "not-needed",
  "completed",
  "degraded",
  "unavailable",
]);

const sourceTweetMediaUnderstandingSchema = z
  .object({
    extraction: z.union([z.null(), sourceTweetMediaExtractionSchema]),
    mediaReads: z.array(sourceTweetMediaReadSchema),
    status: sourceTweetMediaUnderstandingStatusSchema,
  })
  .strict()
  .superRefine((understanding, ctx) => {
    const completedReads = understanding.mediaReads.filter(
      (mediaRead) => mediaRead.status === "completed",
    );
    const hasExtraction = understanding.extraction !== null;

    if (understanding.status === "not-needed") {
      if (understanding.mediaReads.length > 0 || hasExtraction) {
        ctx.addIssue({
          code: "custom",
          message:
            "Not-needed media understanding cannot contain media reads or extraction output.",
          path: ["status"],
        });
      }
      return;
    }

    if (understanding.status === "completed") {
      if (completedReads.length !== understanding.mediaReads.length || !hasExtraction) {
        ctx.addIssue({
          code: "custom",
          message:
            "Completed media understanding requires extraction and only completed media reads.",
          path: ["status"],
        });
      }
      return;
    }

    if (understanding.status === "degraded") {
      if (
        !hasExtraction ||
        completedReads.length === 0 ||
        completedReads.length === understanding.mediaReads.length
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Degraded media understanding requires extraction plus a mix of completed and non-completed media reads.",
          path: ["status"],
        });
      }
      return;
    }

    if (hasExtraction || completedReads.length > 0 || understanding.mediaReads.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "Unavailable media understanding requires at least one unavailable or failed media read and no extraction output.",
        path: ["status"],
      });
    }
  });

type SourceTweetMediaReference = RetrievedSourceTweet["mediaReferences"][number];
type SourceTweetMediaRead = z.infer<typeof sourceTweetMediaReadSchema>;
export type SourceTweetMediaUnderstanding = z.infer<typeof sourceTweetMediaUnderstandingSchema>;
type SourceTweetMediaReader = (input: {
  mediaReference: SourceTweetMediaReference;
}) => Promise<SourceTweetMediaRead>;
export type SourceTweetMediaUnderstandingInput = {
  mediaReferences: SourceTweetMediaReference[];
};

type SourceTweetMediaUnderstandingOptions = {
  reader?: SourceTweetMediaReader;
};

export async function understandSourceTweetMedia(
  { mediaReferences }: SourceTweetMediaUnderstandingInput,
  { reader = readSourceTweetMediaWithFixtures }: SourceTweetMediaUnderstandingOptions = {},
): Promise<SourceTweetMediaUnderstanding> {
  if (mediaReferences.length === 0) {
    return parseSourceTweetMediaUnderstanding({
      extraction: null,
      mediaReads: [],
      status: "not-needed",
    });
  }

  const selectedVideoReferenceId = selectPreferredVideoReferenceId(mediaReferences);
  const mediaReads: SourceTweetMediaRead[] = [];

  for (const mediaReference of mediaReferences) {
    if (!shouldReadMediaReference(mediaReference, selectedVideoReferenceId)) {
      mediaReads.push(
        parseSourceTweetMediaRead({
          kind: mediaReference.kind,
          mediaReferenceId: mediaReference.id,
          reason: "Skipped because v3 currently reads only the longest source tweet video.",
          status: "unavailable",
        }),
      );
      continue;
    }

    if (mediaReference.kind === "gif" || mediaReference.kind === "unknown") {
      mediaReads.push(
        parseSourceTweetMediaRead({
          kind: mediaReference.kind,
          mediaReferenceId: mediaReference.id,
          reason: `The current media-understanding adapter does not support ${mediaReference.kind} media yet.`,
          status: "unavailable",
        }),
      );
      continue;
    }

    mediaReads.push(await reader({ mediaReference }));
  }

  const extraction = buildSourceTweetMediaExtraction(mediaReads);

  return parseSourceTweetMediaUnderstanding({
    extraction,
    mediaReads,
    status: deriveSourceTweetMediaUnderstandingStatus(mediaReads, extraction),
  });
}

async function readSourceTweetMediaWithFixtures({
  mediaReference,
}: {
  mediaReference: SourceTweetMediaReference;
}): Promise<SourceTweetMediaRead> {
  const fixtureSignal = readFixtureSignal(mediaReference);

  if (fixtureSignal.includes("missing") || fixtureSignal.includes("unavailable")) {
    return parseSourceTweetMediaRead({
      kind: mediaReference.kind,
      mediaReferenceId: mediaReference.id,
      reason: "The media asset was unavailable to the fixture media-understanding adapter.",
      status: "unavailable",
    });
  }

  if (fixtureSignal.includes("fail") || fixtureSignal.includes("broken")) {
    return parseSourceTweetMediaRead({
      kind: mediaReference.kind,
      mediaReferenceId: mediaReference.id,
      message: "The fixture media-understanding adapter failed while reading this media reference.",
      status: "failed",
    });
  }

  if (mediaReference.kind === "image") {
    return parseSourceTweetMediaRead(buildFixtureImageRead(mediaReference, fixtureSignal));
  }

  if (mediaReference.kind === "video") {
    return parseSourceTweetMediaRead(buildFixtureVideoRead(mediaReference));
  }

  return parseSourceTweetMediaRead({
    kind: mediaReference.kind,
    mediaReferenceId: mediaReference.id,
    reason: `The fixture media-understanding adapter does not support ${mediaReference.kind} media yet.`,
    status: "unavailable",
  });
}

function parseSourceTweetMediaRead(input: unknown): SourceTweetMediaRead {
  return sourceTweetMediaReadSchema.parse(input);
}

function parseSourceTweetMediaUnderstanding(input: unknown): SourceTweetMediaUnderstanding {
  return sourceTweetMediaUnderstandingSchema.parse(input);
}

function buildSourceTweetMediaExtraction(
  mediaReads: SourceTweetMediaRead[],
): SourceTweetMediaExtraction | null {
  const completedReads = mediaReads.filter(
    (mediaRead): mediaRead is Extract<SourceTweetMediaRead, { status: "completed" }> =>
      mediaRead.status === "completed",
  );

  if (completedReads.length === 0) {
    return null;
  }

  return parseSourceTweetMediaExtraction({
    summary: dedupeValues(completedReads.map((mediaRead) => mediaRead.summary)).join(" "),
    visibleText: dedupeValues(completedReads.flatMap((mediaRead) => mediaRead.visibleText)),
    notableDetails: dedupeValues(completedReads.flatMap((mediaRead) => mediaRead.notableDetails)),
    mediaKinds: dedupeValues(completedReads.map((mediaRead) => mediaRead.kind)),
  });
}

function deriveSourceTweetMediaUnderstandingStatus(
  mediaReads: SourceTweetMediaRead[],
  extraction: SourceTweetMediaExtraction | null,
): SourceTweetMediaUnderstanding["status"] {
  if (mediaReads.length === 0) {
    return "not-needed";
  }

  const completedReads = mediaReads.filter((mediaRead) => mediaRead.status === "completed");

  if (completedReads.length === 0) {
    return "unavailable";
  }

  return extraction && completedReads.length === mediaReads.length ? "completed" : "degraded";
}

function shouldReadMediaReference(
  mediaReference: SourceTweetMediaReference,
  selectedVideoReferenceId: string | null,
) {
  if (mediaReference.kind === "image") {
    return true;
  }

  if (mediaReference.kind !== "video") {
    return false;
  }

  return mediaReference.id === selectedVideoReferenceId;
}

function selectPreferredVideoReferenceId(mediaReferences: SourceTweetMediaReference[]) {
  const videoReferences = mediaReferences.filter(
    (mediaReference) => mediaReference.kind === "video",
  );

  if (videoReferences.length === 0) {
    return null;
  }

  return videoReferences.reduce((selectedReference, mediaReference) => {
    if (!selectedReference) {
      return mediaReference;
    }

    return (mediaReference.durationMs ?? 0) > (selectedReference.durationMs ?? 0)
      ? mediaReference
      : selectedReference;
  }, videoReferences[0]).id;
}

function buildFixtureImageRead(
  mediaReference: SourceTweetMediaReference,
  fixtureSignal: string,
): SourceTweetMediaRead {
  if (fixtureSignal.includes("chart")) {
    return {
      kind: mediaReference.kind,
      mediaReferenceId: mediaReference.id,
      notableDetails: [
        "The chart emphasizes a measurable comparison rather than generic launch artwork.",
        "Trend lines and labels make the claim look data-backed.",
      ],
      status: "completed",
      summary: "A chart-like visual anchors the post in quantitative evidence.",
      visibleText: ["Usage +48%", "Costs +12%"],
    };
  }

  if (fixtureSignal.includes("screenshot") || fixtureSignal.includes("ui")) {
    return {
      kind: mediaReference.kind,
      mediaReferenceId: mediaReference.id,
      notableDetails: [
        "The interface foregrounds controls and workflow structure.",
        "The composition reads like a product surface rather than a marketing graphic.",
      ],
      status: "completed",
      summary: "A product UI screenshot shows the operational surface behind the post.",
      visibleText: ["Launch mode", "Ship faster"],
    };
  }

  return {
    kind: mediaReference.kind,
    mediaReferenceId: mediaReference.id,
    notableDetails: [mediaReference.altText ?? "A still image reinforces the source tweet."],
    status: "completed",
    summary: "A still image reinforces the source tweet with visual context.",
    visibleText: mediaReference.altText ? [mediaReference.altText.replace(/\.$/, "")] : [],
  };
}

function buildFixtureVideoRead(mediaReference: SourceTweetMediaReference): SourceTweetMediaRead {
  return {
    kind: mediaReference.kind,
    mediaReferenceId: mediaReference.id,
    notableDetails: [
      "Sampled frames keep the product interface visible throughout the clip.",
      "The sequence alternates between UI detail and launch-style framing.",
    ],
    status: "completed",
    summary: "A sampled video read adds motion and frame-level context to the source tweet.",
    visibleText: ["Autopilot", "Ship faster"],
  };
}

function readFixtureSignal(mediaReference: SourceTweetMediaReference) {
  return [mediaReference.altText, mediaReference.url, mediaReference.previewUrl]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function dedupeValues(values: string[]) {
  return [...new Set(values)];
}
