import { z } from "zod";

const acceptedHostnames = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);
const sourceStatusPathPattern = /^\/(?:[^/]+\/status|i\/web\/status)\/\d+\/?$/;

const directSourceTweetUrlMessage = "Use a direct x.com or twitter.com status URL.";

function isDirectSourceTweetUrl(value: string) {
  try {
    const parsedUrl = new URL(value);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

    return acceptedHostnames.has(hostname) && sourceStatusPathPattern.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

const sourceTweetUrlSchema = z
  .string()
  .trim()
  .min(1, { message: "Paste a direct X/Twitter status URL." })
  .refine(
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a valid URL." },
  )
  .refine(isDirectSourceTweetUrl, {
    message: directSourceTweetUrlMessage,
  });

export function parseSourceTweetUrl(input: string) {
  const result = sourceTweetUrlSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues.at(0)?.message ?? directSourceTweetUrlMessage,
    } as const;
  }

  return {
    success: true,
    url: result.data,
  } as const;
}
