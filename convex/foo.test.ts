import { describe, expect, test } from "vitest";
import { ConvexTest } from "../syscalls";
import { api } from "./_generated/api";
import schema from "./schema";

describe("some test", () => {
  test("messages", async () => {
    const t = ConvexTest(schema);
    await t.mutation(api.messages.send, { body: "hello", author: "sarah" });
    await t.mutation(api.messages.send, { body: "hello", author: "tom" });
    const asSarah = t.withIdentity({ name: "sarah" });
    const bySarah = await asSarah.query(api.messages.listByAuth, {});
    expect(bySarah.length).toEqual(1);
    const all = await t.run((ctx) => {
      return ctx.db.query("messages").collect();
    });
    expect(all.length).toEqual(2);
  });
});
