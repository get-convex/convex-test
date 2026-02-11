import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";
import counterSchema from "./counter/component/schema";
import * as argumentsValidationModule from "./argumentsValidation";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

function patchExportArgs(
  functionExport: {
    exportArgs: () => string;
  },
  patch: (exported: any) => void,
): () => void {
  const hadOwnExportArgs = Object.prototype.hasOwnProperty.call(
    functionExport,
    "exportArgs",
  );
  const originalExportArgs = functionExport.exportArgs.bind(functionExport);
  functionExport.exportArgs = () => {
    const exported = JSON.parse(originalExportArgs());
    patch(exported);
    return JSON.stringify(exported);
  };
  return () => {
    if (hadOwnExportArgs) {
      functionExport.exportArgs = originalExportArgs;
    } else {
      delete (functionExport as any).exportArgs;
    }
  };
}

function forceStripUnknownKeys(functionExport: {
  exportArgs: () => string;
}): () => void {
  return patchExportArgs(functionExport, (exported: any) => {
    if (exported.type === "object") {
      exported.unknownKeys = "strip";
    }
  });
}

function forceStripUnknownKeysOnUnionObjectField(
  functionExport: {
    exportArgs: () => string;
  },
  fieldName: string,
  memberIndexes?: number[],
): () => void {
  return patchExportArgs(functionExport, (exported: any) => {
    const union = exported?.value?.[fieldName]?.fieldType;
    if (!union || union.type !== "union") {
      throw new Error(`Expected a union field at args.${fieldName}`);
    }
    union.value.forEach((member: any, index: number) => {
      if (member.type !== "object") {
        return;
      }
      if (memberIndexes && !memberIndexes.includes(index)) {
        return;
      }
      member.unknownKeys = "strip";
    });
  });
}

function forceStripUnknownKeysOnNestedUnionObjectField(
  functionExport: {
    exportArgs: () => string;
  },
  fieldName: string,
  memberIndex: number,
  nestedFieldName: string,
): () => void {
  return patchExportArgs(functionExport, (exported: any) => {
    const union = exported?.value?.[fieldName]?.fieldType;
    if (!union || union.type !== "union") {
      throw new Error(`Expected a union field at args.${fieldName}`);
    }
    const member = union.value?.[memberIndex];
    if (!member || member.type !== "object") {
      throw new Error(
        `Expected an object member at args.${fieldName}[${memberIndex}]`,
      );
    }
    const nestedObject = member?.value?.[nestedFieldName]?.fieldType;
    if (!nestedObject || nestedObject.type !== "object") {
      throw new Error(
        `Expected an object field at args.${fieldName}[${memberIndex}].${nestedFieldName}`,
      );
    }
    nestedObject.unknownKeys = "strip";
  });
}

test("query arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.query(api.argumentsValidation.queryWithArgs, { a: "bad" as any }),
  ).rejects.toThrowError("Validator error");
  await t.query(api.argumentsValidation.queryWithoutArgs, { a: "ok" } as any);
});

test("mutation arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.mutation(api.argumentsValidation.mutationWithArgs, {
        a: 42,
        bad: 1,
      } as any),
  ).rejects.toThrowError("Validator error");
  await t.mutation(api.argumentsValidation.mutationWithoutArgs, {
    a: "ok",
  } as any);
});

test("action arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.action(api.argumentsValidation.actionWithArgs, {} as any),
  ).rejects.toThrowError("Validator error");
  await t.action(api.argumentsValidation.actionWithoutArgs, { a: "ok" } as any);
});

test("optional fields", async () => {
  const t = convexTest(schema);
  const result = await t.query(
    api.argumentsValidation.queryWithOptionalArgs,
    {},
  );
  expect(result).toEqual("ok");
});

function testWithCounter() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  return t;
}

test("component mutation arguments validation", async () => {
  const t = testWithCounter();
  expect(
    await t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: 42,
    }),
  ).toEqual(42);
  await expect(
    t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: "bad" as any,
    }),
  ).rejects.toThrowError(/Validator error/);
  expect(
    await t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: Number.POSITIVE_INFINITY,
    }),
  ).toEqual(Number.POSITIVE_INFINITY);
});

test("query with union arg", async () => {
  const t = testWithCounter();
  expect(
    await t.query(api.argumentsValidation.queryWithUnionArg, {
      a: 42,
    }),
  ).toEqual("ok");
  expect(
    await t.query(api.argumentsValidation.queryWithUnionArg, {
      a: "42",
    }),
  ).toEqual("ok");
  await expect(
    t.query(api.argumentsValidation.queryWithUnionArg, {
      a: null as any,
    }),
  ).rejects.toThrowError(/Validator error/);
});

test("query object arg strip mode", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeys(
    argumentsValidationModule.queryWithStripObjectArg as any,
  );
  try {
    expect(
      await t.query(api.argumentsValidation.queryWithStripObjectArg, {
        a: 42,
        extra: "strip me",
      } as any),
    ).toEqual({ a: 42 });
    await expect(
      t.query(api.argumentsValidation.queryWithStripObjectArg, {
        a: "bad" as any,
      }),
    ).rejects.toThrowError(/Validator error/);
  } finally {
    restore();
  }
});

test("mutation object arg strip mode", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeys(
    argumentsValidationModule.mutationWithStripObjectArg as any,
  );
  try {
    expect(
      await t.mutation(api.argumentsValidation.mutationWithStripObjectArg, {
        a: 42,
        extra: "strip me",
      } as any),
    ).toEqual({ a: 42 });
    await expect(
      t.mutation(api.argumentsValidation.mutationWithStripObjectArg, {
        a: "bad" as any,
      }),
    ).rejects.toThrowError(/Validator error/);
  } finally {
    restore();
  }
});

test("action object arg strip mode", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeys(
    argumentsValidationModule.actionWithStripObjectArg as any,
  );
  try {
    expect(
      await t.action(api.argumentsValidation.actionWithStripObjectArg, {
        a: 42,
        extra: "strip me",
      } as any),
    ).toEqual({ a: 42 });
    await expect(
      t.action(api.argumentsValidation.actionWithStripObjectArg, {
        a: "bad" as any,
      }),
    ).rejects.toThrowError(/Validator error/);
  } finally {
    restore();
  }
});

test("union object arg prefers strict member over strip member", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeysOnUnionObjectField(
    argumentsValidationModule.queryWithUnionStripNarrowFirstArg as any,
    "obj",
    [0],
  );
  try {
    expect(
      await t.query(api.argumentsValidation.queryWithUnionStripNarrowFirstArg, {
        obj: { a: 42, b: 7 },
      } as any),
    ).toEqual({ a: 42, b: 7 });
  } finally {
    restore();
  }
});

test("union object arg uses declaration order among strip members", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeysOnUnionObjectField(
    argumentsValidationModule.queryWithUnionStripNarrowFirstArg as any,
    "obj",
  );
  try {
    expect(
      await t.query(api.argumentsValidation.queryWithUnionStripNarrowFirstArg, {
        obj: { a: 42, b: 7 },
      } as any),
    ).toEqual({ a: 42 });
  } finally {
    restore();
  }
});

test("union object arg preserves more fields when strip members are reordered", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeysOnUnionObjectField(
    argumentsValidationModule.queryWithUnionStripWideFirstArg as any,
    "obj",
  );
  try {
    expect(
      await t.query(api.argumentsValidation.queryWithUnionStripWideFirstArg, {
        obj: { a: 42, b: 7 },
      } as any),
    ).toEqual({ a: 42, b: 7 });
  } finally {
    restore();
  }
});

test("union object arg does not leak nested strip mutations across failed members", async () => {
  const t = convexTest(schema);
  const restore = forceStripUnknownKeysOnNestedUnionObjectField(
    argumentsValidationModule.queryWithUnionNestedStripFailureArg as any,
    "obj",
    0,
    "inner",
  );
  try {
    expect(
      await t.query(
        api.argumentsValidation.queryWithUnionNestedStripFailureArg,
        {
          obj: { inner: { a: 42, extra: "keep me" } },
        } as any,
      ),
    ).toEqual({ inner: { a: 42, extra: "keep me" } });
  } finally {
    restore();
  }
});
