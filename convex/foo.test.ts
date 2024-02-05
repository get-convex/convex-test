import { setup } from "../syscalls"
import { beforeAll, describe, expect, test } from "@jest/globals";
import * as Messages from "./messages"

describe("t", () => {
  let t: { runMutation: any, runQuery: any };
  beforeAll(() => {
     t = setup(null)
  })
  test("messages", async () => {
    
    await t.runMutation(Messages.send, { body: "hello", author: "sarah"})
    await t.runMutation(Messages.send, { body: "hello", author: "tom"})
    const bySarah = await t.runQuery(Messages.listByAuth, { author: "sarah"})
    expect(bySarah.length).toEqual(1)
    const all = await t.runQuery(Messages.list, {})
    expect(all.length).toEqual(2)
  });
});
