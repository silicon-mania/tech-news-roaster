import type { NewsLinkedImage } from "@/features/generation/generation-events";
import {
  type OutsideXEnrichmentInput,
  OutsideXEnrichmentUnavailableError,
  retrieveOutsideXEnrichment,
} from "@/services/outside-x-enrichment";

export type NewsLinkedImageDiscoveryInput = Pick<
  OutsideXEnrichmentInput,
  "replySignals" | "sourceTweet"
>;

export type NewsLinkedImageDiscoveryResult = {
  discoveredAt: string;
  newsLinkedImages: NewsLinkedImage[];
};

export type NewsLinkedImageDiscoveryService = (
  input: NewsLinkedImageDiscoveryInput,
) => Promise<NewsLinkedImageDiscoveryResult>;

export class NewsLinkedImageDiscoveryUnavailableError extends OutsideXEnrichmentUnavailableError {
  constructor(message = "News-linked image discovery endpoint is not configured.") {
    super(message);
    this.name = "NewsLinkedImageDiscoveryUnavailableError";
  }
}

export async function discoverNewsLinkedImages(
  input: NewsLinkedImageDiscoveryInput,
): Promise<NewsLinkedImageDiscoveryResult> {
  try {
    const enrichmentContext = await retrieveOutsideXEnrichment({
      ...input,
      usersDirection: "",
    });

    return {
      discoveredAt: enrichmentContext.retrievedAt,
      newsLinkedImages: enrichmentContext.newsLinkedImages,
    };
  } catch (error) {
    if (error instanceof OutsideXEnrichmentUnavailableError) {
      throw new NewsLinkedImageDiscoveryUnavailableError();
    }

    throw error;
  }
}
