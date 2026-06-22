import { describe, expect, test } from "vitest";
import type { SourceTweetMediaReference } from "@/services/tweet-retrieval";
import {
  assembleImageOriginalCandidates,
  imageOriginalCandidateOriginSchema,
  imageOriginalCandidateTarget,
} from "./image-original-candidate";
import type { NewsLinkedImage } from "./news-linked-image";

function sourceImage(index: number): SourceTweetMediaReference {
  return {
    id: `media-${index}`,
    kind: "image",
    url: `https://cdn.example.com/source-${index}.jpg`,
    previewUrl: `https://cdn.example.com/source-${index}-preview.jpg`,
    altText: `Source image ${index}.`,
  };
}

function newsLinkedImage(index: number): NewsLinkedImage {
  return {
    id: `news-linked-image-${index}`,
    url: `https://news.example.com/image-${index}.jpg`,
    altText: `News-linked image ${index}.`,
    sourceUrl: `https://news.example.com/article-${index}`,
    title: `Headline ${index}`,
  };
}

describe("imageOriginalCandidateOriginSchema", () => {
  test("accepts the user-uploaded origin alongside the existing candidate origins", () => {
    expect(imageOriginalCandidateOriginSchema.options).toEqual([
      "source-tweet-media",
      "news-linked-image",
      "user-uploaded",
    ]);
    expect(imageOriginalCandidateOriginSchema.parse("user-uploaded")).toBe("user-uploaded");
    expect(imageOriginalCandidateOriginSchema.parse("source-tweet-media")).toBe(
      "source-tweet-media",
    );
    expect(imageOriginalCandidateOriginSchema.parse("news-linked-image")).toBe("news-linked-image");
    expect(() => imageOriginalCandidateOriginSchema.parse("operator-uploaded")).toThrow();
  });
});

describe("assembleImageOriginalCandidates", () => {
  test("0 usable source images: all four candidates come from news-linked images, in order", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [1, 2, 3, 4, 5].map(newsLinkedImage),
      sourceTweetMedia: [],
    });

    expect(candidates).toHaveLength(imageOriginalCandidateTarget);
    expect(candidates.every((candidate) => candidate.origin === "news-linked-image")).toBe(true);
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "news-linked-image-candidate-news-linked-image-1",
      "news-linked-image-candidate-news-linked-image-2",
      "news-linked-image-candidate-news-linked-image-3",
      "news-linked-image-candidate-news-linked-image-4",
    ]);
  });

  test("partial source images: source media comes first, news-linked images fill the rest", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [1, 2, 3, 4].map(newsLinkedImage),
      sourceTweetMedia: [sourceImage(1), sourceImage(2)],
    });

    expect(candidates).toHaveLength(imageOriginalCandidateTarget);
    expect(candidates.map((candidate) => candidate.origin)).toEqual([
      "source-tweet-media",
      "source-tweet-media",
      "news-linked-image",
      "news-linked-image",
    ]);
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://cdn.example.com/source-1.jpg",
      "https://cdn.example.com/source-2.jpg",
      "https://news.example.com/image-1.jpg",
      "https://news.example.com/image-2.jpg",
    ]);
  });

  test("exactly four usable source images: no news-linked top-up runs", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [1, 2, 3].map(newsLinkedImage),
      sourceTweetMedia: [1, 2, 3, 4].map(sourceImage),
    });

    expect(candidates).toHaveLength(imageOriginalCandidateTarget);
    expect(candidates.every((candidate) => candidate.origin === "source-tweet-media")).toBe(true);
  });

  test("more than four usable source images: keep the first four, no news-linked top-up", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [1, 2].map(newsLinkedImage),
      sourceTweetMedia: [1, 2, 3, 4, 5, 6].map(sourceImage),
    });

    expect(candidates).toHaveLength(imageOriginalCandidateTarget);
    expect(candidates.every((candidate) => candidate.origin === "source-tweet-media")).toBe(true);
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://cdn.example.com/source-1.jpg",
      "https://cdn.example.com/source-2.jpg",
      "https://cdn.example.com/source-3.jpg",
      "https://cdn.example.com/source-4.jpg",
    ]);
  });

  test("non-image source media is not usable and is skipped before top-up", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [1, 2, 3].map(newsLinkedImage),
      sourceTweetMedia: [
        sourceImage(1),
        { id: "clip", kind: "video", url: "https://cdn.example.com/clip.mp4" },
        { id: "loop", kind: "gif", url: "https://cdn.example.com/loop.gif" },
        sourceImage(2),
      ],
    });

    expect(candidates.map((candidate) => candidate.origin)).toEqual([
      "source-tweet-media",
      "source-tweet-media",
      "news-linked-image",
      "news-linked-image",
    ]);
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://cdn.example.com/source-1.jpg",
      "https://cdn.example.com/source-2.jpg",
      "https://news.example.com/image-1.jpg",
      "https://news.example.com/image-2.jpg",
    ]);
  });

  test("fewer than four total images available: returns only what exists, without padding", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [],
      sourceTweetMedia: [sourceImage(1)],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].origin).toBe("source-tweet-media");
  });

  test("maps the underlying media and image fields onto candidates", () => {
    const candidates = assembleImageOriginalCandidates({
      newsLinkedImages: [newsLinkedImage(7)],
      sourceTweetMedia: [sourceImage(3)],
    });

    expect(candidates[0]).toEqual({
      id: "source-tweet-media-candidate-media-3",
      origin: "source-tweet-media",
      url: "https://cdn.example.com/source-3.jpg",
      previewUrl: "https://cdn.example.com/source-3-preview.jpg",
      altText: "Source image 3.",
    });
    expect(candidates[1]).toEqual({
      id: "news-linked-image-candidate-news-linked-image-7",
      origin: "news-linked-image",
      url: "https://news.example.com/image-7.jpg",
      altText: "News-linked image 7.",
      sourceUrl: "https://news.example.com/article-7",
      title: "Headline 7",
    });
  });
});
