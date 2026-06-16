import "server-only";

import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "@/services/auth";
import { getOperatorSession } from "@/services/auth/operator-session";
import { type OperatorSessionReader, resolveOwnerId } from "./run-repository";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

// The private bucket generated image bytes land in. Keys are
// `${ownerId}/${runId}/${optionId}`; the owner prefix is applied by the store so
// one Operator Account can never reach another's bytes (and so the RLS policy in
// supabase/migrations/0002 can scope objects by their first path segment).
export const imageBytesBucket = "generated-images";

export type StoredImageBytes = {
  bytes: Buffer;
  contentType: string;
};

/**
 * Owner-scoped object storage for generated image bytes. Callers pass a
 * run-relative {@link imageStoragePath} (`${runId}/${optionId}`); the owner
 * prefix is added by construction so ownership is enforced in this layer.
 */
export type ImageBytesStore = {
  get(path: string): Promise<StoredImageBytes | null>;
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
};

export function imageStoragePath(runId: string, optionId: string): string {
  return `${runId}/${optionId}`;
}

/**
 * The Supabase Storage implementation. Built with the service-role client and
 * always prefixes the owner id, so the Operator Account boundary holds
 * regardless of bucket-level row-level security.
 */
export function createSupabaseImageBytesStore(
  ownerId: string,
  client: SupabaseClient,
): ImageBytesStore {
  const bucket = client.storage.from(imageBytesBucket);

  function objectKey(path: string): string {
    return `${ownerId}/${path}`;
  }

  return {
    async get(path) {
      const { data, error } = await bucket.download(objectKey(path));

      // A missing object surfaces as an error here; treat any download failure
      // as "not stored" so the serving route answers 404 rather than 500.
      if (error || !data) {
        return null;
      }

      return {
        bytes: Buffer.from(await data.arrayBuffer()),
        contentType: data.type || "application/octet-stream",
      };
    },

    async put(path, bytes, contentType) {
      const { error } = await bucket.upload(objectKey(path), bytes, {
        contentType,
        upsert: true,
      });

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

// Process-lifetime store shared across requests. It backs local fixture
// development (no Supabase configured): bytes survive a browser reload because
// the Node server keeps the map, while durable, cross-device storage needs
// Supabase. Tests pass a fresh map for isolation.
const sharedImageBytesByOwner = new Map<string, Map<string, StoredImageBytes>>();

/**
 * An owner-scoped {@link ImageBytesStore} held entirely in memory, used as the
 * local-dev fallback when Supabase is unconfigured.
 */
export function createInMemoryImageBytesStore(
  ownerId: string,
  bytesByOwner: Map<string, Map<string, StoredImageBytes>> = sharedImageBytesByOwner,
): ImageBytesStore {
  function ownerBytes(): Map<string, StoredImageBytes> {
    const existing = bytesByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created = new Map<string, StoredImageBytes>();
    bytesByOwner.set(ownerId, created);

    return created;
  }

  return {
    async get(path) {
      return ownerBytes().get(path) ?? null;
    },

    async put(path, bytes, contentType) {
      ownerBytes().set(path, { bytes: Buffer.from(bytes), contentType });
    },
  };
}

function createImageBytesStore(
  ownerId: string,
  env: SupabaseEnvironment = process.env,
): ImageBytesStore {
  const config = readSupabaseConfig(env);

  if (!config) {
    return createInMemoryImageBytesStore(ownerId);
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return createSupabaseImageBytesStore(ownerId, client);
}

export type ImageBytesStoreResolution = { store: ImageBytesStore } | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request and hands back its image-bytes
 * store, or rejects when Supabase is configured but no operator is signed in —
 * the same gate {@link resolveOwnerId} applies to runs, so a run and its bytes
 * always share one owner.
 */
export async function resolveImageBytesStore(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<ImageBytesStoreResolution> {
  const owner = await resolveOwnerId(env, getSession);

  if ("unauthorized" in owner) {
    return { unauthorized: true };
  }

  return { store: createImageBytesStore(owner.ownerId, env) };
}
