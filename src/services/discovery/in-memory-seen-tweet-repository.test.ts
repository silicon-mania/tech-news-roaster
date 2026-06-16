import { describe, expect, test } from "vitest";
import { createInMemorySeenTweetRepository } from "./in-memory-seen-tweet-repository";

describe("createInMemorySeenTweetRepository", () => {
  test("returns every id as unseen before anything is recorded", async () => {
    const repository = createInMemorySeenTweetRepository("operator-1", new Map());

    expect(await repository.filterUnseen(["a", "b"])).toEqual(["a", "b"]);
  });

  test("drops ids already marked seen so a second sweep never reprocesses them", async () => {
    const repository = createInMemorySeenTweetRepository("operator-1", new Map());

    await repository.markSeen(["a", "b"]);

    expect(await repository.filterUnseen(["a", "b", "c"])).toEqual(["c"]);
  });

  test("scopes the record to its owner", async () => {
    const seenTweetsByOwner = new Map();
    const operatorOne = createInMemorySeenTweetRepository("operator-1", seenTweetsByOwner);
    const operatorTwo = createInMemorySeenTweetRepository("operator-2", seenTweetsByOwner);

    await operatorOne.markSeen(["a"]);

    expect(await operatorTwo.filterUnseen(["a"])).toEqual(["a"]);
  });
});
