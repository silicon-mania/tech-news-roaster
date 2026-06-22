import "server-only";

import { Buffer } from "node:buffer";
import { type ImageOption, type ImageSet, parseImageSet } from "@/services/generation";
import { type ImageBytesStore, imageStoragePath } from "./image-bytes-store";

/**
 * Resolves the raw bytes (and content type) behind one image option URL. The
 * default decodes gateway `data:` URLs in place and fetches everything else, so
 * both the inlined gateway variations and the local provider's remote URLs land
 * as bytes. Injected in tests so persistence never touches the network.
 */
export type ImageBytesFetcher = (url: string) => Promise<{ bytes: Buffer; contentType: string }>;

/**
 * Moves an Image Set's bytes — the Selected Image Original plus its four
 * variations — into owner-scoped object storage and rewrites every option URL to
 * a server route under `/api/runs/${runId}/images/${optionId}`. The returned
 * Image Set carries only those served URLs, so the persisted run never holds the
 * raw bytes and the client never sees a storage key or credential (ADR-0019).
 * The Selected Image Original's URL is repointed at the stored original too, so
 * the Final Quote Tweet Image recomposes from stored bytes on reopen (ADR-0018).
 */
/**
 * Moves a list of Image Options' bytes into owner-scoped object storage and
 * rewrites each URL to its `/api/runs/${runId}/images/${optionId}` server route.
 * The granular building block shared by {@link persistImageSetBytes} (a whole
 * source-derived or uploaded set) and the uploaded route, which persists the
 * original up front — independent of whether its variations later succeed.
 */
export async function persistImageOptionsBytes({
  fetchBytes = fetchImageBytes,
  options,
  origin,
  runId,
  store,
}: {
  fetchBytes?: ImageBytesFetcher;
  options: readonly ImageOption[];
  origin: string;
  runId: string;
  store: ImageBytesStore;
}): Promise<ImageOption[]> {
  return Promise.all(
    options.map(async (option) => {
      const { bytes, contentType } = await fetchBytes(option.url);

      await store.put(imageStoragePath(runId, option.id), bytes, contentType);

      return { ...option, url: servedImageUrl({ optionId: option.id, origin, runId }) };
    }),
  );
}

export async function persistImageSetBytes({
  fetchBytes = fetchImageBytes,
  imageSet,
  origin,
  runId,
  store,
}: {
  fetchBytes?: ImageBytesFetcher;
  imageSet: ImageSet;
  origin: string;
  runId: string;
  store: ImageBytesStore;
}): Promise<ImageSet> {
  const rewrittenOptions = await persistImageOptionsBytes({
    fetchBytes,
    options: imageSet.options,
    origin,
    runId,
    store,
  });

  return parseImageSet({
    ...imageSet,
    options: rewrittenOptions,
    selectedImageOriginal: {
      ...imageSet.selectedImageOriginal,
      url: rewrittenOptions[0].url,
    },
  });
}

export function servedImageUrl({
  optionId,
  origin,
  runId,
}: {
  optionId: string;
  origin: string;
  runId: string;
}): string {
  return `${origin}/api/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(optionId)}`;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (url.startsWith("data:")) {
    return decodeDataUrl(url);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Image bytes could not be fetched (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new Error("Image bytes were empty.");
  }

  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

function decodeDataUrl(url: string): { bytes: Buffer; contentType: string } {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url);

  if (!match) {
    throw new Error("Image data URL was malformed.");
  }

  const [, mediaType, base64Marker, payload] = match;
  const bytes = base64Marker
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return {
    bytes,
    contentType: mediaType || "application/octet-stream",
  };
}
