import { setup, TestConvex } from "../syscalls"
import { beforeAll, describe, expect, test } from "@jest/globals";
import * as Messages from "./messages"
import schema from "./schema";

describe("t", () => {
  let t: TestConvex<typeof schema>

  beforeAll(() => {
     t = setup(schema)
  })
  test("messages", async () => {
    await t.runMutation(Messages.send, { body: "hello", author: "sarah"})
    await t.runMutation(Messages.send, { body: "hello", author: "tom"})
    t.auth.setUserIdentity({ tokenIdentifier: "", subject: "", issuer: "", name: "sarah" })
    const bySarah = await t.runQuery(Messages.listByAuth, {})
    expect(bySarah.length).toEqual(1)
    const all = await t.run((ctx) => {
      return ctx.db.query("messages").collect()
    })
    expect(all.length).toEqual(2)
  });
});
