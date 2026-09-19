import { expect, test } from "vitest";
import { componentsGeneric, makeFunctionReference } from "convex/server";
import { convexTest } from "../index";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import schema from "./schema";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

class PausedBlob extends Blob {
  readonly readStarted = deferred();
  readonly allowRead = deferred();

  async arrayBuffer() {
    this.readStarted.resolve();
    await this.allowRead.promise;
    return super.arrayBuffer();
  }
}

test("action store blob", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
  const storageId = await t.action(internal.storage.actionStoreBlob, { bytes });
  const result = await t.query(internal.storage.listFiles);
  expect(result).toMatchObject([
    {
      _id: storageId,
      sha256: "v2DkNJys5rzg1VLo14NCjbZtDWSb2eQwo2J+LuFKyDk=",
      size: 2,
    },
  ]);
});

test("action get blob", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
  const storageId = await t.action(internal.storage.actionStoreBlob, { bytes });
  const result = await t.action(internal.storage.actionGetBlob, {
    id: storageId,
  });
  expect(result).toEqual(bytes);
});

test("action delete blob", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
  const storageId = await t.action(internal.storage.actionStoreBlob, { bytes });
  await t.action(internal.storage.actionDeleteBlob, { id: storageId });
  const result = await t.action(internal.storage.actionGetBlob, {
    id: storageId,
  });
  expect(result).toBeNull();
});

test("mutation delete blob", async () => {
  const t = convexTest(schema);
  const storageId = await t.run(async (ctx) => {
    const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
    return await ctx.storage.store(new Blob([bytes]));
  });
  await t.mutation(internal.storage.mutationDeleteBlob, { id: storageId });
  const result = await t.action(internal.storage.actionGetBlob, {
    id: storageId,
  });
  expect(result).toBeNull();
});

test("query get URL", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
  const id = await t.action(internal.storage.actionStoreBlob, { bytes });
  {
    const result = await t.query(internal.storage.queryGetUrl, { id });
    expect(result).toMatch("https://");
  }
  await t.mutation(internal.storage.mutationDeleteBlob, { id });
  {
    const result = await t.query(internal.storage.queryGetUrl, { id });
    expect(result).toBeNull();
  }
});

test("mutation generate upload URL", async () => {
  const t = convexTest(schema);
  const result = await t.mutation(internal.storage.mutationGenerateUploadUrl);
  expect(result).toMatch("https://");
});

test.each(["direct", "scheduled"] as const)(
  "%s action storage waits for a concurrent mutation",
  async (invocation) => {
    const actionStarted = deferred();
    const allowStore = deferred();
    const storeRequested = deferred();
    const blob = new PausedBlob(["stored"]);
    const mutationStarted = deferred();
    const allowCommit = deferred();
    const t = convexTest(schema, {
      "./_generated/server.js": async () => ({}),
      "./storage.js": async () => ({
        store: internalAction({
          args: {},
          handler: async (ctx) => {
            actionStarted.resolve();
            await allowStore.promise;
            const result = ctx.storage.store(blob);
            storeRequested.resolve();
            return await result;
          },
        }),
      }),
    });
    const store = makeFunctionReference<"action">("storage:store");
    const action = invocation === "direct" ? t.action(store) : null;
    const jobId =
      invocation === "scheduled"
        ? await t.mutation((ctx) => ctx.scheduler.runAfter(0, store, {}))
        : null;
    await actionStarted.promise;
    const mutation = t.mutation(async () => {
      mutationStarted.resolve();
      await allowCommit.promise;
    });
    try {
      await mutationStarted.promise;
      allowStore.resolve();
      await storeRequested.promise;
      allowCommit.resolve();
      await mutation;
      blob.allowRead.resolve();
      if (action !== null) {
        await action;
      } else {
        await t.finishInProgressScheduledFunctions();
        const job = await t.query((ctx) => ctx.db.system.get(jobId!));
        expect(job?.state.kind).toBe("success");
      }
      const files = await t.query((ctx) =>
        ctx.db.system.query("_storage").collect(),
      );
      expect(files).toHaveLength(1);
      expect(
        await t.action(async (ctx) =>
          (await ctx.storage.get(files[0]._id))?.text(),
        ),
      ).toBe("stored");
    } finally {
      allowStore.resolve();
      allowCommit.resolve();
      blob.allowRead.resolve();
      await Promise.allSettled([mutation, action]);
      await t.finishInProgressScheduledFunctions();
    }
  },
);

test("concurrent actions store blobs in separate transactions", async () => {
  const t = convexTest(schema);
  const firstBlob = new PausedBlob(["first"]);
  const secondBlob = new PausedBlob(["second"]);
  const secondStoreRequested = deferred();
  const first = t.action((ctx) => ctx.storage.store(firstBlob));
  await firstBlob.readStarted.promise;
  const second = t.action(async (ctx) => {
    const result = ctx.storage.store(secondBlob);
    secondStoreRequested.resolve();
    return await result;
  });
  try {
    await secondStoreRequested.promise;
    firstBlob.allowRead.resolve();
    const firstId = await first;
    secondBlob.allowRead.resolve();
    const secondId = await second;
    expect(
      await t.action(async (ctx) => [
        await (await ctx.storage.get(firstId))?.text(),
        await (await ctx.storage.get(secondId))?.text(),
      ]),
    ).toEqual(["first", "second"]);
  } finally {
    firstBlob.allowRead.resolve();
    secondBlob.allowRead.resolve();
    await Promise.allSettled([first, second]);
  }
});

test("action storage deletion survives a concurrent mutation rollback", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([1, 2]).buffer;
  const id = await t.action(internal.storage.actionStoreBlob, { bytes });
  const mutationStarted = deferred();
  const allowRollback = deferred();
  const deleteRequested = deferred();
  const mutation = expect(
    t.mutation(async () => {
      mutationStarted.resolve();
      await allowRollback.promise;
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  await mutationStarted.promise;
  const deletion = t.action(async (ctx) => {
    const result = ctx.storage.delete(id);
    deleteRequested.resolve();
    await result;
  });
  try {
    await deleteRequested.promise;
    allowRollback.resolve();
    await mutation;
    await deletion;
    expect(await t.action(internal.storage.actionGetBlob, { id })).toBeNull();
    expect(await t.query(internal.storage.queryGetUrl, { id })).toBeNull();
  } finally {
    allowRollback.resolve();
    await Promise.allSettled([mutation, deletion]);
  }
});

test("t.run storage changes roll back with the transaction", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([1, 2]).buffer;
  const id = await t.action(internal.storage.actionStoreBlob, { bytes });
  await expect(
    t.run(async (ctx) => {
      const newId = await ctx.storage.store(new Blob(["uncommitted"]));
      expect(await (await ctx.storage.get(newId))?.text()).toBe("uncommitted");
      await ctx.storage.delete(id);
      expect(await ctx.storage.get(id)).toBeNull();
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  const files = await t.query(internal.storage.listFiles);
  expect(files.map((file) => file._id)).toEqual([id]);
  expect(await t.action(internal.storage.actionGetBlob, { id })).toEqual(bytes);
});

test.each(["root", "component"] as const)(
  "nested %s storage deletion rolls back with its parent mutation",
  async (target) => {
    const t = convexTest(schema);
    const storage =
      target === "component"
        ? componentsGeneric().files.storage
        : internal.storage;
    if (target === "component") {
      t.registerComponent("files", schema, import.meta.glob("./**/*.*s"));
    }
    const bytes = new Uint8Array([1, 2]).buffer;
    const id = await t.action(storage.actionStoreBlob, { bytes });
    await expect(
      t.mutation(async (ctx) => {
        await ctx.runMutation(storage.mutationDeleteBlob, { id });
        expect(await ctx.runQuery(storage.queryGetUrl, { id })).toBeNull();
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await t.action(storage.actionGetBlob, { id })).toEqual(bytes);
    expect(await t.query(storage.queryGetUrl, { id })).toMatch("https://");
    await t.action(storage.actionDeleteBlob, { id });
    expect(await t.action(storage.actionGetBlob, { id })).toBeNull();
    expect(await t.query(storage.queryGetUrl, { id })).toBeNull();
    expect(await t.query(storage.listFiles)).toEqual([]);
  },
);

test("storage actions use their own convexTest instance's transaction", async () => {
  const outer = convexTest(schema);
  const inner = convexTest(schema);
  const id = await outer.run(() =>
    inner.action((ctx) => ctx.storage.store(new Blob(["separate instance"]))),
  );
  expect(
    await inner.action(async (ctx) => (await ctx.storage.get(id))?.text()),
  ).toBe("separate instance");
  expect(await outer.query(internal.storage.listFiles)).toEqual([]);

  await outer.run(() => inner.action((ctx) => ctx.storage.delete(id)));
  expect(await inner.action(internal.storage.actionGetBlob, { id })).toBeNull();
});

test("a foreign transaction marker cannot reuse an active inner transaction", async () => {
  const outer = convexTest(schema);
  const inner = convexTest(schema);
  const mutationStarted = deferred();
  const allowCommit = deferred();
  const storeRequested = deferred();
  const blob = new PausedBlob(["separate transaction"]);
  const mutation = inner.mutation(async () => {
    mutationStarted.resolve();
    await allowCommit.promise;
  });
  await mutationStarted.promise;
  const storage = outer.run(() =>
    inner.action(async (ctx) => {
      const result = ctx.storage.store(blob);
      storeRequested.resolve();
      return await result;
    }),
  );
  try {
    await storeRequested.promise;
    allowCommit.resolve();
    await mutation;
    blob.allowRead.resolve();
    const id = await storage;
    expect(
      await inner.action(async (ctx) => (await ctx.storage.get(id))?.text()),
    ).toBe("separate transaction");
  } finally {
    allowCommit.resolve();
    blob.allowRead.resolve();
    await Promise.allSettled([mutation, storage]);
  }
});

test("storage actions can reenter a live ancestor instance's transaction", async () => {
  const outer = convexTest(schema);
  const inner = convexTest(schema);
  const id = await outer.run(() =>
    inner.run(() =>
      outer.action((ctx) =>
        ctx.storage.store(new Blob(["ancestor transaction"])),
      ),
    ),
  );
  expect(
    await outer.action(async (ctx) => (await ctx.storage.get(id))?.text()),
  ).toBe("ancestor transaction");
  expect(await inner.query(internal.storage.listFiles)).toEqual([]);
});

test.each(["idle", "busy"] as const)(
  "storage ignores a finished transaction when its instance is %s",
  async (state) => {
    const t = convexTest(schema);
    const allowStore = deferred();
    const storeRequested = deferred();
    const blob = new PausedBlob(["deferred storage"]);
    const mutationStarted = deferred();
    const allowCommit = deferred();
    let action!: Promise<Id<"_storage">>;
    await t.run(async () => {
      action = t.action(async (ctx) => {
        await allowStore.promise;
        const result = ctx.storage.store(blob);
        storeRequested.resolve();
        return await result;
      });
    });
    const mutation =
      state === "busy"
        ? t.mutation(async () => {
            mutationStarted.resolve();
            await allowCommit.promise;
          })
        : null;
    try {
      if (mutation !== null) {
        await mutationStarted.promise;
      }
      allowStore.resolve();
      await storeRequested.promise;
      allowCommit.resolve();
      if (mutation !== null) {
        await mutation;
      }
      blob.allowRead.resolve();
      const id = await action;
      expect(
        await t.action(async (ctx) => (await ctx.storage.get(id))?.text()),
      ).toBe("deferred storage");
    } finally {
      allowStore.resolve();
      allowCommit.resolve();
      blob.allowRead.resolve();
      await Promise.allSettled([mutation, action]);
    }
  },
);
