import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("text search", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello convex" });
    await ctx.db.insert("messages", { author: "michal", body: "hello next" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello base" });
  });
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "hello",
      author: null,
    });
    expect(messages).toMatchObject([
      { author: "sarah", body: "hello convex" },
      { author: "michal", body: "hello next" },
      { author: "sarah", body: "hello base" },
    ]);
  }
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "hello",
      author: "sarah",
    });
    expect(messages).toMatchObject([
      { author: "sarah", body: "hello convex" },
      { author: "sarah", body: "hello base" },
    ]);
  }
  {
    const messages = await t.query(api.textSearch.textSearch, {
      body: "con",
      author: null,
    });
    expect(messages).toMatchObject([{ author: "sarah", body: "hello convex" }]);
  }
});
