import { describe, expect, test } from "vitest";
import { isSupabaseConfigured, readSupabaseConfig } from "./supabase-config";

const fullEnv = {
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SUPABASE_URL: "https://project.supabase.co",
};

describe("supabase config", () => {
  test("reads the full server-only credential set", () => {
    expect(readSupabaseConfig(fullEnv)).toEqual({
      anonKey: "anon",
      serviceRoleKey: "service-role",
      url: "https://project.supabase.co",
    });
    expect(isSupabaseConfigured(fullEnv)).toBe(true);
  });

  test("treats a partial credential set as unconfigured", () => {
    expect(readSupabaseConfig({ SUPABASE_URL: "https://project.supabase.co" })).toBeNull();
    expect(
      isSupabaseConfigured({
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toBe(false);
  });

  test("treats blank values as unset", () => {
    expect(
      isSupabaseConfigured({
        ...fullEnv,
        SUPABASE_SERVICE_ROLE_KEY: "   ",
      }),
    ).toBe(false);
  });
});
