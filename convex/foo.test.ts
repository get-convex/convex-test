import { beforeAll, describe, expect, test } from "vitest";
import { setup, TestConvex } from "../syscalls";
import { api } from "./_generated/api";
import schema from "./schema";

describe("t", () => {
  let t: TestConvex<typeof schema>;

  beforeAll(() => {
    t = setup(schema);
  });

  test("messages", async () => {
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
