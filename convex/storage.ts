import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalQuery,
  mutation,
} from "./_generated/server";
import { Doc } from "./_generated/dataModel";

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
