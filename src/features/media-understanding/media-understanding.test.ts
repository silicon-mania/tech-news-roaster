import { describe, expect, test, vi } from "vitest";
import type { RetrievedSourceTweet } from "@/features/tweet-retrieval/tweet-retrieval";
import { understandSourceTweetMedia } from "./media-understanding";

describe("media understanding", () => {
  test("returns provider-agnostic screenshot and chart reads with an aggregated extraction", async () => {
    const result = await understandSourceTweetMedia({
      mediaReferences: [
        buildMediaReference({
          altText: "Launch product screenshot.",
          id: "screenshot-1",
          kind: "image",
          url: "https://cdn.example.com/launch-product-screenshot.jpg",
        }),
        buildMediaReference({
          altText: "Platform update chart.",
          id: "chart-1",
          kind: "image",
          url: "https://cdn.example.com/platform-update-chart.jpg",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "completed",
      extraction: {
        mediaKinds: ["image"],
        notableDetails: expect.arrayContaining([
          "The interface foregrounds controls and workflow structure.",
          "Trend lines and labels make the claim look data-backed.",
        ]),
        summary:
          "A product UI screenshot shows the operational surface behind the post. A chart-like visual anchors the post in quantitative evidence.",
        visibleText: expect.arrayContaining([
          "Launch mode",
          "Ship faster",
          "Usage +48%",
          "Costs +12%",
        ]),
      },
      mediaReads: [
        expect.objectContaining({
          kind: "image",
          mediaReferenceId: "screenshot-1",
          status: "completed",
          visibleText: ["Launch mode", "Ship faster"],
        }),
        expect.objectContaining({
          kind: "image",
          mediaReferenceId: "chart-1",
          status: "completed",
          visibleText: ["Usage +48%", "Costs +12%"],
        }),
      ],
    });
  });

  test("keeps unavailable and failed reads visible for degraded downstream context without mutating the retrieval result", async () => {
    const mediaReferences = [
      buildMediaReference({
        altText: "Launch product screenshot.",
        id: "screenshot-1",
        kind: "image",
        url: "https://cdn.example.com/launch-product-screenshot.jpg",
      }),
      buildMediaReference({
        altText: "Missing supporting screenshot.",
        id: "missing-image-1",
        kind: "image",
        url: "https://cdn.example.com/missing-supporting-screenshot.jpg",
      }),
      buildMediaReference({
        altText: "Broken chart render.",
        id: "broken-chart-1",
        kind: "image",
        url: "https://cdn.example.com/broken-chart-render.jpg",
      }),
    ];
    const originalMediaReferences = structuredClone(mediaReferences);

    const result = await understandSourceTweetMedia({
      mediaReferences,
    });

    expect(mediaReferences).toEqual(originalMediaReferences);
    expect(result.status).toBe("degraded");
    expect(result.extraction).toMatchObject({
      mediaKinds: ["image"],
      summary: "A product UI screenshot shows the operational surface behind the post.",
      visibleText: ["Launch mode", "Ship faster"],
    });
    expect(result.mediaReads).toEqual([
      expect.objectContaining({
        mediaReferenceId: "screenshot-1",
        status: "completed",
      }),
      expect.objectContaining({
        mediaReferenceId: "missing-image-1",
        reason: "The media asset was unavailable to the fixture media-understanding adapter.",
        status: "unavailable",
      }),
      expect.objectContaining({
        mediaReferenceId: "broken-chart-1",
        message:
          "The fixture media-understanding adapter failed while reading this media reference.",
        status: "failed",
      }),
    ]);
  });

  test("reads only the longest source tweet video and marks shorter videos unavailable", async () => {
    const reader = vi.fn(
      async ({ mediaReference }: { mediaReference: SourceTweetMediaReference }) => ({
        kind: mediaReference.kind,
        mediaReferenceId: mediaReference.id,
        notableDetails: [`Read ${mediaReference.id}`],
        status: "completed" as const,
        summary: `Summary for ${mediaReference.id}`,
        visibleText: [`Visible text for ${mediaReference.id}`],
      }),
    );

    const result = await understandSourceTweetMedia(
      {
        mediaReferences: [
          buildMediaReference({
            altText: "Launch product screenshot.",
            id: "screenshot-1",
            kind: "image",
            url: "https://cdn.example.com/launch-product-screenshot.jpg",
          }),
          buildMediaReference({
            altText: "Short launch teaser video.",
            durationMs: 9_000,
            id: "video-short",
            kind: "video",
            url: "https://cdn.example.com/launch-short.mp4",
          }),
          buildMediaReference({
            altText: "Long launch demo video.",
            durationMs: 31_000,
            id: "video-long",
            kind: "video",
            url: "https://cdn.example.com/launch-long.mp4",
          }),
        ],
      },
      { reader },
    );

    expect(reader).toHaveBeenCalledTimes(2);
    expect(reader.mock.calls.map(([call]) => call.mediaReference.id)).toEqual([
      "screenshot-1",
      "video-long",
    ]);
    expect(result.status).toBe("degraded");
    expect(result.mediaReads).toEqual([
      expect.objectContaining({
        mediaReferenceId: "screenshot-1",
        status: "completed",
      }),
      expect.objectContaining({
        mediaReferenceId: "video-short",
        reason: "Skipped because v3 currently reads only the longest source tweet video.",
        status: "unavailable",
      }),
      expect.objectContaining({
        mediaReferenceId: "video-long",
        status: "completed",
      }),
    ]);
    expect(result.extraction).toMatchObject({
      mediaKinds: ["image", "video"],
      visibleText: ["Visible text for screenshot-1", "Visible text for video-long"],
    });
  });
});

type SourceTweetMediaReference = RetrievedSourceTweet["mediaReferences"][number];

function buildMediaReference(
  overrides: Partial<SourceTweetMediaReference> &
    Pick<SourceTweetMediaReference, "id" | "kind" | "url">,
): SourceTweetMediaReference {
  return {
    id: overrides.id,
    kind: overrides.kind,
    url: overrides.url,
    altText: overrides.altText,
    durationMs: overrides.durationMs,
    height: overrides.height ?? 900,
    previewUrl: overrides.previewUrl,
    width: overrides.width ?? 1440,
  };
}
