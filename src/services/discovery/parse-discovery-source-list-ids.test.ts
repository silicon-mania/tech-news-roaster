import { describe, expect, test } from "vitest";
import { parseDiscoverySourceListIds } from "./parse-discovery-source-list-ids";

describe("parseDiscoverySourceListIds", () => {
  test("splits comma-separated ids", () => {
    expect(parseDiscoverySourceListIds("list-1,list-2,list-3")).toEqual([
      "list-1",
      "list-2",
      "list-3",
    ]);
  });

  test("trims whitespace around each id", () => {
    // Mirrors the discovery-sweep route fixture "list-1, list-2 ,list-3".
    expect(parseDiscoverySourceListIds("list-1, list-2 ,list-3")).toEqual([
      "list-1",
      "list-2",
      "list-3",
    ]);
  });

  test("drops blank entries from doubled or trailing commas", () => {
    expect(parseDiscoverySourceListIds("list-1,, list-2 , ,")).toEqual(["list-1", "list-2"]);
  });

  test("returns an empty array for an empty string", () => {
    expect(parseDiscoverySourceListIds("")).toEqual([]);
  });

  test("returns an empty array for undefined", () => {
    expect(parseDiscoverySourceListIds(undefined)).toEqual([]);
  });
});
