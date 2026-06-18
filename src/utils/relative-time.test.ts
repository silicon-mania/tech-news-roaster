import { afterEach, describe, expect, test, vi } from "vitest";
import { formatRelativeTime } from "./relative-time";

function freezeAt(isoTimestamp: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTimestamp));
}

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("reads an absent timestamp as just now", () => {
    expect(formatRelativeTime(undefined)).toBe("just now");
  });

  test("reads sub-minute elapsed as just now", () => {
    freezeAt("2026-06-06T12:00:30.000Z");

    expect(formatRelativeTime("2026-06-06T12:00:00.000Z")).toBe("just now");
  });

  test("formats minutes, singular and plural", () => {
    freezeAt("2026-06-06T12:10:00.000Z");

    expect(formatRelativeTime("2026-06-06T12:09:00.000Z")).toBe("1 minute ago");
    expect(formatRelativeTime("2026-06-06T11:50:00.000Z")).toBe("20 minutes ago");
  });

  test("formats hours", () => {
    freezeAt("2026-06-06T12:00:00.000Z");

    expect(formatRelativeTime("2026-06-06T09:00:00.000Z")).toBe("3 hours ago");
  });

  test("formats days up to a fortnight", () => {
    freezeAt("2026-06-06T12:00:00.000Z");

    expect(formatRelativeTime("2026-06-04T12:00:00.000Z")).toBe("2 days ago");
  });

  test("formats weeks beyond a fortnight", () => {
    freezeAt("2026-06-22T12:00:00.000Z");

    expect(formatRelativeTime("2026-06-01T12:00:00.000Z")).toBe("3 weeks ago");
  });
});
