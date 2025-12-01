/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api, internal, components } from "./_generated/api";
import schema from "./schema";
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import counterSchema from "../counter/component/schema";

const counterModules = import.meta.glob("../counter/component/**/*.ts");

test("t.ctx.runQuery can call queries", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "test message", author: "tester" });
  });

  const result = await t.ctx.runQuery(internal.actions.list);
  expect(result).toMatchObject([{ body: "test message", author: "tester" }]);
});

test("t.ctx.runMutation can call mutations", async () => {
  const t = convexTest(schema);

  await t.ctx.runMutation(api.actions.add, {
    body: "ctx test",
    author: "ctx tester",
  });

  const result = await t.query(internal.actions.list);
  expect(result).toMatchObject([{ body: "ctx test", author: "ctx tester" }]);
});

test("t.ctx.runAction can call actions", async () => {
  const t = convexTest(schema);

  const result = await t.ctx.runAction(internal.actions.actionCallingAction, {
    count: 3,
  });
  expect(result.called).toEqual(3);
});

test("t.ctx can be passed to helper functions", async () => {
  const t = convexTest(schema);

  async function helperFunction(ctx: {
    runQuery: typeof t.ctx.runQuery;
    runMutation: typeof t.ctx.runMutation;
  }) {
    await ctx.runMutation(api.actions.add, {
      body: "from helper",
      author: "helper",
    });
    return await ctx.runQuery(internal.actions.list);
  }

  const result = await helperFunction(t.ctx);
  expect(result).toMatchObject([{ body: "from helper", author: "helper" }]);
});

test("t.ctx works with multiple function calls", async () => {
  const t = convexTest(schema);

  await t.ctx.runMutation(api.actions.add, {
    body: "message 1",
    author: "author 1",
  });
  await t.ctx.runMutation(api.actions.add, {
    body: "message 2",
    author: "author 2",
  });

  const result = await t.ctx.runQuery(internal.actions.list);
  expect(result).toHaveLength(2);
  expect(result).toMatchObject([
    { body: "message 1", author: "author 1" },
    { body: "message 2", author: "author 2" },
  ]);
});

async function counterHelperFunction(
  ctx: Pick<GenericMutationCtx<GenericDataModel>, "runMutation" | "runQuery">,
  component: typeof components.counter,
) {
  await ctx.runMutation(component.public.add, {
    name: "beans",
    count: 3,
  });
  const count = await ctx.runQuery(component.public.count, {
    name: "beans",
  });
  return count;
}

test("t.ctx can be passed to helper functions with components", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);

  const result = await counterHelperFunction(t.ctx, components.counter);
  expect(result).toEqual(3);
});

test("t.ctx works with component helper functions and multiple calls", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);

  async function multiCallHelper(
    ctx: Pick<GenericMutationCtx<GenericDataModel>, "runMutation" | "runQuery">,
    component: typeof components.counter,
  ) {
    await ctx.runMutation(component.public.add, {
      name: "pennies",
      count: 250,
    });
    await ctx.runMutation(component.public.add, {
      name: "beans",
      count: 3,
      shards: 100,
    });
    const count = await ctx.runQuery(component.public.count, {
      name: "beans",
    });
    return count;
  }

  const result = await multiCallHelper(t.ctx, components.counter);
  expect(result).toEqual(3);
});

test("t.ctx can call component functions directly", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);

  await t.ctx.runMutation(components.counter.public.add, {
    name: "beans",
    count: 5,
  });

  const result = await t.ctx.runQuery(components.counter.public.count, {
    name: "beans",
  });
  expect(result).toEqual(5);
});
