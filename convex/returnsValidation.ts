import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query that returns a document but the return validator is INCOMPLETE
// (missing _creationTime which Convex auto-adds to all documents)
// TypeScript won't catch this because the handler type matches
export const queryWithIncompleteReturnValidator = query({
  args: {},
  // BUG: Missing _creationTime in validator! Runtime will have it but validator doesn't expect it.
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("messages"),
      author: v.string(),
      body: v.string(),
      embedding: v.optional(v.array(v.number())),
      score: v.optional(v.number()),
      // _creationTime: v.number(), <-- INTENTIONALLY MISSING
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("messages").first();
  },
});

// Query with correct return validator (includes _creationTime)
export const queryWithCorrectReturnValidator = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      author: v.string(),
      body: v.string(),
      embedding: v.optional(v.array(v.number())),
      score: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("messages").first();
  },
});

// Query returning primitive (not object)
export const queryReturningNumber = query({
  args: {},
  returns: v.number(),
  handler: async () => {
    return 42;
  },
});

// Query with wrong primitive type - use `any` to bypass TypeScript
export const queryReturningWrongType = query({
  args: {},
  returns: v.string(),
  handler: async (): Promise<any> => {
    return 42; // Returns number but validator expects string
  },
});

// Mutation with incomplete return validator
export const mutationWithIncompleteReturnValidator = mutation({
  args: { author: v.string(), body: v.string() },
  returns: v.object({
    _id: v.id("messages"),
    author: v.string(),
    body: v.string(),
    embedding: v.optional(v.array(v.number())),
    score: v.optional(v.number()),
    // _creationTime: v.number(), <-- INTENTIONALLY MISSING
  }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", args);
    return (await ctx.db.get(id))!;
  },
});

// Mutation with correct return validator
export const mutationWithCorrectReturnValidator = mutation({
  args: { author: v.string(), body: v.string() },
  returns: v.object({
    _id: v.id("messages"),
    _creationTime: v.number(),
    author: v.string(),
    body: v.string(),
    embedding: v.optional(v.array(v.number())),
    score: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", args);
    return (await ctx.db.get(id))!;
  },
});

// Query without return validator (should pass - no validation)
export const queryWithoutReturnValidator = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").first();
  },
});

// Query returning array with incomplete item validator
export const queryReturningArrayWithIncompleteValidator = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      author: v.string(),
      body: v.string(),
      embedding: v.optional(v.array(v.number())),
      score: v.optional(v.number()),
      // Missing _creationTime
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("messages").collect();
  },
});
