import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import {
  createInMemoryImageBytesStore,
  createSupabaseImageBytesStore,
  imageBytesBucket,
  imageStoragePath,
  resolveImageBytesStore,
  type StoredImageBytes,
} from "./image-bytes-store";

const configuredEnv = {
  OPERATOR_ALLOWLISTED_EMAILS: "operator@example.com",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_URL: "https://project.supabase.co",
} as const;

describe("in-memory image bytes store", () => {
  test("round-trips bytes and content type for a run-relative path", async () => {
    const store = createInMemoryImageBytesStore("operator-1", new Map());
    const path = imageStoragePath("run-1", "image-set-run-1-original");

    await store.put(path, Buffer.from("original-bytes"), "image/jpeg");
    const stored = await store.get(path);

    expect(stored?.contentType).toBe("image/jpeg");
    expect(stored?.bytes.toString()).toBe("original-bytes");
  });

  test("returns null for an unknown path", async () => {
    const store = createInMemoryImageBytesStore("operator-1", new Map());

    expect(await store.get(imageStoragePath("run-1", "missing"))).toBeNull();
  });

  test("scopes bytes per owner so one operator cannot read another's", async () => {
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    const path = imageStoragePath("run-1", "image-set-run-1-variation-1");

    await createInMemoryImageBytesStore("operator-1", bytesByOwner).put(
      path,
      Buffer.from("a"),
      "image/png",
    );

    expect(await createInMemoryImageBytesStore("operator-2", bytesByOwner).get(path)).toBeNull();
  });
});

describe("supabase image bytes store", () => {
  test("uploads and downloads under the owner-prefixed object key", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const download = vi.fn().mockResolvedValue({
      data: new Blob([Buffer.from("bytes")], { type: "image/png" }),
      error: null,
    });
    const from = vi.fn().mockReturnValue({ download, upload });
    const client = { storage: { from } } as unknown as SupabaseClient;
    const store = createSupabaseImageBytesStore("operator-1", client);

    await store.put(imageStoragePath("run-1", "opt-1"), Buffer.from("bytes"), "image/png");
    const stored = await store.get(imageStoragePath("run-1", "opt-1"));

    expect(from).toHaveBeenCalledWith(imageBytesBucket);
    expect(upload).toHaveBeenCalledWith("operator-1/run-1/opt-1", expect.any(Buffer), {
      contentType: "image/png",
      upsert: true,
    });
    expect(download).toHaveBeenCalledWith("operator-1/run-1/opt-1");
    expect(stored?.bytes.toString()).toBe("bytes");
    expect(stored?.contentType).toBe("image/png");
  });

  test("treats a download error as not stored", async () => {
    const from = vi.fn().mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: null, error: { message: "Object not found" } }),
      upload: vi.fn(),
    });
    const client = { storage: { from } } as unknown as SupabaseClient;

    expect(
      await createSupabaseImageBytesStore("operator-1", client).get(
        imageStoragePath("run-1", "opt-1"),
      ),
    ).toBeNull();
  });

  test("throws when an upload fails", async () => {
    const from = vi.fn().mockReturnValue({
      download: vi.fn(),
      upload: vi.fn().mockResolvedValue({ error: { message: "storage is full" } }),
    });
    const client = { storage: { from } } as unknown as SupabaseClient;

    await expect(
      createSupabaseImageBytesStore("operator-1", client).put(
        imageStoragePath("run-1", "opt-1"),
        Buffer.from("bytes"),
        "image/png",
      ),
    ).rejects.toThrow("storage is full");
  });
});

describe("resolveImageBytesStore", () => {
  test("falls back to a usable store when Supabase is unconfigured", async () => {
    const resolution = await resolveImageBytesStore({}, async () => null);

    expect("store" in resolution).toBe(true);
  });

  test("rejects when Supabase is configured but no operator is signed in", async () => {
    const resolution = await resolveImageBytesStore(configuredEnv, async () => null);

    expect(resolution).toEqual({ unauthorized: true });
  });

  test("binds the store to the signed-in operator when configured", async () => {
    const resolution = await resolveImageBytesStore(configuredEnv, async () => ({
      userId: "operator-9",
    }));

    expect("store" in resolution).toBe(true);
  });
});
