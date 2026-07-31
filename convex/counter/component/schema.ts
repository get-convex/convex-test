import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  counters: defineTable({
    name: v.string(),
    value: v.number(),
    shard: v.number(),
    commitTs: v.optional(v.commitTs()),
  }).index("name", ["name", "shard"]),
});
