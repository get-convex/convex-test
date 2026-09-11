import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/// helpers

export const listFiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.system.query("_storage").collect();
  },
});

/// action store blob (storage/storeBlob)

export const actionStoreBlob = internalAction({
  args: {
    bytes: v.bytes(),
  },
  handler: async (ctx, { bytes }) => {
    return await ctx.storage.store(new Blob([bytes]));
  },
});

/// action get blob (storage/getBlob)

export const actionGetBlob = internalAction({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    return (await ctx.storage.get(id))?.arrayBuffer();
  },
});

/// action delete blob (1.0/storageDelete)

export const actionDeleteBlob = internalAction({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    await ctx.storage.delete(id);
  },
});

/// mutation delete blob (1.0/storageDelete)

export const mutationDeleteBlob = internalMutation({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    await ctx.storage.delete(id);
  },
});

/// query get URL (1.0/storageGetUrl)

export const queryGetUrl = internalQuery({
  args: {
    id: v.id("_storage"),
  },
  handler: async (ctx, { id }) => {
    return await ctx.storage.getUrl(id);
  },
});

/// mutation generate upload URL (1.0/storageGenerateUploadUrl)

export const mutationGenerateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/// globals that the framework uses internally

// `convexTest` hashes stored blobs with `crypto` and `btoa`, and builds upload
// tokens without randomness. Patching those globals here checks that storage
// neither breaks nor observes the patches.
export const actionStoreBlobWithPatchedGlobals = internalAction({
  args: {
    bytes: v.bytes(),
  },
  handler: async (ctx, { bytes }) => {
    (globalThis as any).crypto = {};
    (globalThis as any).btoa = () => "patched";
    return await ctx.storage.store(new Blob([bytes]));
  },
});

export const mutationGenerateUploadUrlsWithPatchedRandom = internalMutation({
  args: {},
  handler: async (ctx) => {
    const patchedMath = Object.create(Math) as Math;
    patchedMath.random = () => 0.5;
    (globalThis as any).Math = patchedMath;
    return [
      await ctx.storage.generateUploadUrl(),
      await ctx.storage.generateUploadUrl(),
    ];
  },
});
