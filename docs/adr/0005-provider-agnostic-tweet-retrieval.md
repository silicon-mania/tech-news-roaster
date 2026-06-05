# Provider-Agnostic Tweet Retrieval

The product uses a server-side tweet retrieval service that can call whichever external provider reliably returns the source tweet and replies, rather than binding the application directly to the official X API. TwitterAPI.io is the first approved retrieval provider for v1, using its tweet lookup and tweet replies endpoints behind the service boundary with the server-only `TWITTERAPI_IO_API_KEY` credential. We chose this because tweet and reply access is a critical dependency for product quality, and a provider-agnostic boundary gives us more flexibility around reliability, quotas, and retrieval constraints while keeping vendor response shapes out of the product language.

## Provider Choice

TwitterAPI.io is the first retrieval adapter. The adapter uses `GET /twitter/tweets` to fetch the source tweet by ID and `GET /twitter/tweet/replies/v2` to fetch direct replies. The service sends the credential as the `x-api-key`/`X-API-Key` request header and never exposes it to the client.

## Retrieval Bounds

V1 fetches up to 40 direct replies in relevance order, using `queryType=Relevance` and no more than two replies pages per source tweet. Zero replies is a valid retrieval result, while an unavailable source tweet fails the generation run.

Each generation run performs one source tweet lookup and at most two reply-page requests. TwitterAPI.io is credit-metered and may still return rate, credit, timeout, or provider errors; the retrieval service handles those as product-contract failures rather than exposing vendor messages directly.

## Normalized Contract

The Tweet Retrieval Service returns a provider-agnostic shape rather than raw TwitterAPI.io data:

```json
{
  "sourceTweet": {
    "id": "123",
    "url": "https://x.com/user/status/123",
    "text": "Actual source tweet text",
    "createdAt": "2026-06-05T10:00:00.000Z",
    "author": {
      "username": "user",
      "displayName": "User"
    },
    "metrics": {
      "replies": 12,
      "reposts": 3,
      "quotes": 2,
      "likes": 120,
      "views": 5000
    }
  },
  "replies": [
    {
      "id": "456",
      "text": "Reply text",
      "createdAt": "2026-06-05T10:03:00.000Z",
      "author": {
        "username": "reply_user",
        "displayName": "Reply User"
      },
      "metrics": {
        "replies": 0,
        "reposts": 0,
        "quotes": 0,
        "likes": 5,
        "views": 100
      }
    }
  ]
}
```

The Source Tweet Preview uses only `sourceTweet.text`; author and metrics may support prompt context, reply signals, and future heuristics, but they do not become visible UI chrome in v1.

## Fixture Strategy

Most tests use normalized retrieval fixtures so route, generation, and UI behavior stay independent of the first vendor. Adapter-mapping tests also keep one small raw TwitterAPI.io tweet lookup response and one small raw TwitterAPI.io replies response to verify vendor-to-contract translation. Automated tests do not depend on live X data.

## Failure Modes

Source tweet failures stop the generation run because the source tweet is the required anchor. These include an unavailable source tweet, an empty or unusable source tweet payload, provider rate limits, provider credit exhaustion, timeouts, malformed provider payloads, and unknown provider errors while fetching the source tweet.

Replies failures do not stop the generation run when the source tweet was fetched successfully. If replies are unavailable because of a replies endpoint error, timeout, malformed replies payload, provider rate limit, provider credit exhaustion, or unknown provider error, the service continues with source-only context and an empty replies list.
