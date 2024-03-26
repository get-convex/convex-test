import {
  GenericId,
  JSONValue,
  Value,
  convexToJson,
  jsonToConvex,
} from "convex/values";
import {
  GenericDocument,
  queryGeneric,
  mutationGeneric,
  GenericDataModel,
  UserIdentity,
  QueryBuilder,
  RegisteredQuery,
  FunctionVisibility,
  DefaultFunctionArgs,
  RegisteredMutation,
  GenericMutationCtx,
  SchemaDefinition,
  GenericSchema,
  DataModelFromSchemaDefinition,
  FunctionReference,
  getFunctionName,
  actionGeneric,
  OptionalRestArgs,
  FunctionReturnType,
  makeFunctionReference,
} from "convex/server";

/*
- Arg validation
- Schema validation
- Transactions
- Real ID algorithm
- Pagination

*/

type FilterJson =
  | { $eq: [FilterJson, FilterJson] }
  | { $field: string }
  | JSONValue;

type QueryOperator = { filter: FilterJson } | { limit: number };
type Source =
  | { type: "FullTableScan"; tableName: string; order: "asc" | "desc" | null }
  | {
      type: "IndexRange";
      indexName: string;
      range: ReadonlyArray<SerializedRangeExpression>;
      order: "asc" | "desc" | null;
    }
  | {
      type: "Search";
      indexName: string;
      filters: ReadonlyArray<SerializedSearchFilter>;
    };

type SerializedQuery = {
  source: Source;
  operators: Array<QueryOperator>;
};

export type SerializedRangeExpression = {
  type: "Eq" | "Gt" | "Gte" | "Lt" | "Lte";
  fieldPath: string;
  value: JSONValue;
};

export type SerializedSearchFilter =
  | {
      type: "Search";
      fieldPath: string;
      value: string;
    }
  | {
      type: "Eq";
      fieldPath: string;
      value: JSONValue;
    };

class DatabaseFake {
  private _tables: Record<string, number> = {};
  private _documents: Record<
    string,
    { tableName: string; document: GenericDocument }
  > = {};
  private _nextQueryId: number = 1;
  private _nextDocId: number = 10000;
  private _nextTableId: number = 10000;
  private _queryResults: Record<string, Array<GenericDocument>> = {};
  static __instance: null | DatabaseFake = null;

  constructor(_schema: any) {}

  get(id: GenericId<string>) {
    if (typeof id !== "string") {
      throw new Error(
        `Invalid argument \`id\` for \`db.get\`, expected string but got '${typeof id}': ${
          id as any
        }`
      );
    }

    return this._documents[id]?.document ?? null;
  }

  private _generateId<TableName extends string>(
    table: TableName
  ): GenericId<TableName> {
    const id = this._nextDocId.toString();
    this._nextDocId += 1;
    return id as GenericId<TableName>;
  }

  insert<TableName extends string>(table: TableName, value: any) {
    const _id = this._generateId(table);
    const doc = {
      ...value,
      _id,
      _creationTime: Date.now(),
    };
    this._documents[_id] = { document: doc, tableName: table };
    // this._documentIdsByTable[table].add(_id)
    return _id;
  }

  // patch<TableName extends string>(id: GenericId<TableName>, value: Record<string, any>): Promise<void> {
  //   const doc = this._documents[id];
  //   if (doc === undefined) {
  //     throw new Error("Patch on non existent doc")
  //   }
  //   this._documents[id] = {...doc, ...value}
  //   return Promise.resolve()
  // }

  // replace<TableName extends string>(id: GenericId<TableName>, value: Record<string, any>): Promise<void> {
  //   const doc = this._documents[id];
  //   if (doc === undefined) {
  //     throw new Error("Patch on non existent doc")
  //   }
  //   if (value._id !== undefined && value._id !== doc._id) {
  //     throw new Error("_id mismatch")
  //   }
  //   this._documents[id] = {...value, _id: doc._id, _creationTime: doc._creationTime }
  //   return Promise.resolve()
  // }

  // delete(id: GenericId<string>): Promise<void> {
  //   const doc = this._documents[id];
  //   if (doc === undefined) {
  //     throw new Error("Delete on non existent doc")
  //   }
  //   delete this._documents[id]
  //   return Promise.resolve()
  // }

  startQuery(j: JSONValue) {
    const id = this._nextQueryId;
    const results = this._evaluateQuery((j as any).query);
    this._queryResults[id] = results;
    this._nextQueryId += 1;
    return id;
  }

  queryNext(queryId: number) {
    const results = this._queryResults[queryId];
    if (results === undefined) {
      throw new Error("Bad queryId");
    }
    if (results.length === 0) {
      return { value: null, done: true };
    } else {
      return { value: results.pop(), done: false };
    }
  }

  private _evaluateQuery(query: SerializedQuery): Array<GenericDocument> {
    const source = query.source;
    let results = [];
    let fieldPathsToSortBy = ["_creationTime"];
    let order = "asc";
    switch (source.type) {
      case "FullTableScan": {
        const tableName = source.tableName;
        for (const doc of Object.values(this._documents)) {
          if (doc.tableName === tableName) {
            results.push(doc.document);
          }
        }
        order = source.order ?? "asc";

        break;
      }
      case "IndexRange": {
        const [tableName, indexName] = source.indexName.split(".");
        for (const doc of Object.values(this._documents)) {
          if (doc.tableName === tableName) {
            results.push(doc.document);
          }
        }
        results = results.filter((v) =>
          source.range.every((f) => evaluateRangeFilter(v, f))
        );
        // this should really look up the index
        fieldPathsToSortBy = source.range.map((v) => v.fieldPath);
        order = source.order ?? "asc";
        break;
      }
      case "Search": {
        throw new Error("not implemented");
      }
    }
    const filters: Array<FilterJson> = query.operators
      .filter((o) => (o as any).filter !== undefined)
      .map((o) => (o as any).filter);
    // @ts-ignore
    const limit: { limit: number } | null =
      query.operators.filter((o) => (o as any).limit !== undefined)[0] ?? null;

    results = results.filter((v) => filters.every((f) => evaluateFilter(v, f)));

    results.sort((a, b) => {
      const orderMultiplier = order === "asc" ? 1 : -1;
      let v = 0;
      for (const fp of fieldPathsToSortBy) {
        v = compareValues(evaluateFieldPath(fp, a), evaluateFieldPath(fp, b));
        if (v !== 0) {
          return v * orderMultiplier;
        }
      }
      return v * orderMultiplier;
    });

    if (limit !== null) {
      return results.slice(0, limit.limit);
    }

    return results;
  }
}

function compareValues(a: Value | undefined, b: Value | undefined) {
  // TODO: respect the comparison ordering between different value types
  if (a === b) {
    return 0;
  }
  if (a === undefined) {
    return -1;
  }
  if (b === undefined) {
    return 1;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a < b ? -1 : 1;
}

export function isSimpleObject(value: unknown) {
  const isObject = typeof value === "object";
  const prototype = Object.getPrototypeOf(value);
  const isSimple =
    prototype === null ||
    prototype === Object.prototype ||
    // Objects generated from other contexts (e.g. across Node.js `vm` modules) will not satisfy the previous
    // conditions but are still simple objects.
    prototype?.constructor?.name === "Object";
  return isObject && isSimple;
}

function evaluateFieldPath(fieldPath: string, document: any) {
  const pathParts = fieldPath.split(".");
  let result: Value | undefined = document;
  for (const p of pathParts) {
    result = isSimpleObject(result) ? (result as any)[p] : undefined;
  }
  return result;
}

function evaluateFilter(
  document: GenericDocument,
  filter: any
): Value | undefined {
  if (filter.$eq !== undefined) {
    return (
      evaluateFilter(document, filter.$eq[0]) ===
      evaluateFilter(document, filter.$eq[1])
    );
  }
  if (filter.$field !== undefined) {
    return evaluateFieldPath(filter.$field, document);
  }
  if (filter.$literal !== undefined) {
    return filter.$literal;
  }
  throw new Error(`not implemented: ${JSON.stringify(filter)}`);
}

function evaluateRangeFilter(
  document: GenericDocument,
  expr: SerializedRangeExpression
) {
  const result = evaluateFieldPath(expr.fieldPath, document);
  const value = expr.value;
  switch (expr.type) {
    case "Eq":
      return result === value;
    case "Gt":
      return (result as any) > (value as any);
    case "Gte":
      return (result as any) >= (value as any);
    case "Lt":
      return (result as any) < (value as any);
    case "Lte":
      return (result as any) <= (value as any);
  }
}

function syscallImpl(db: DatabaseFake) {
  return (op: string, jsonArgs: string) => {
    const args = JSON.parse(jsonArgs);
    switch (op) {
      case "1.0/queryStream": {
        const queryId = db.startQuery(args);
        return JSON.stringify({ queryId });
      }
      case "1.0/queryCleanup": {
        return JSON.stringify({});
      }
      default: {
        throw new Error(`\`convexTest\` does not support syscall: "${op}"`);
      }
    }
  };
}

class AuthFake {
  constructor(private _userIdentity: any = null) {}

  getUserIdentity(): Promise<any> {
    return Promise.resolve(this._userIdentity);
  }
}

function asyncSyscallImpl(db: DatabaseFake) {
  return async (op: string, jsonArgs: string): Promise<string> => {
    const args = JSON.parse(jsonArgs);
    switch (op) {
      case "1.0/get": {
        const doc = db.get(args.id);
        return JSON.stringify(convexToJson(doc));
      }
      case "1.0/insert": {
        const _id = db.insert(args.table, jsonToConvex(args.value));
        return JSON.stringify({ _id });
      }
      case "1.0/queryStreamNext": {
        const { value, done } = db.queryNext(args.queryId);
        return JSON.stringify({ value: convexToJson(value as any), done });
      }
      case "1.0/actions/query": {
        const { name, args: queryArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth(new AuthFake()).query(
              makeFunctionReference(name),
              queryArgs
            )
          )
        );
      }
      case "1.0/actions/mutation": {
        const { name, args: mutationArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth(new AuthFake()).mutation(
              makeFunctionReference(name),
              mutationArgs
            )
          )
        );
      }
      case "1.0/actions/action": {
        const { name, args: actionArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth(new AuthFake()).action(
              makeFunctionReference(name),
              actionArgs
            )
          )
        );
      }
      default: {
        throw new Error(
          `\`convexTest\` does not support async syscall: "${op}"`
        );
      }
    }
    return Promise.resolve("");
  };
}

export type TestConvex<SchemaDef extends SchemaDefinition<any, boolean>> =
  TestConvexForDataModel<DataModelFromSchemaDefinition<SchemaDef>>;

export type TestConvexForDataModel<DataModel extends GenericDataModel> = {
  withIdentity(identity: Partial<UserIdentity>): {
    query: <Query extends FunctionReference<"query", any>>(
      func: Query,
      ...args: OptionalRestArgs<Query>
    ) => Promise<FunctionReturnType<Query>>;
    mutation: <Mutation extends FunctionReference<"mutation", any>>(
      func: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ) => Promise<FunctionReturnType<Mutation>>;
    action: <Action extends FunctionReference<"action", any>>(
      func: Action,
      ...args: OptionalRestArgs<Action>
    ) => Promise<FunctionReturnType<Action>>;
    run: <Output>(
      func: (ctx: GenericMutationCtx<DataModel>) => Promise<Output>
    ) => Promise<Output>;
  };

  query: <Query extends FunctionReference<"query", any>>(
    func: Query,
    ...args: OptionalRestArgs<Query>
  ) => Promise<FunctionReturnType<Query>>;
  mutation: <Mutation extends FunctionReference<"mutation", any>>(
    func: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
  action: <Action extends FunctionReference<"action", any>>(
    func: Action,
    ...args: OptionalRestArgs<Action>
  ) => Promise<FunctionReturnType<Action>>;
  run: <Output>(
    func: (ctx: GenericMutationCtx<DataModel>) => Promise<Output>
  ) => Promise<Output>;
};

export const convexTest = <Schema extends GenericSchema>(
  schema: SchemaDefinition<Schema, boolean> | null
): TestConvex<SchemaDefinition<Schema, boolean>> => {
  const db = new DatabaseFake(schema);
  // @ts-ignore
  global.Convex = {
    syscall: syscallImpl(db),
    asyncSyscall: asyncSyscallImpl(db),
  };

  return {
    withIdentity(identity: Partial<UserIdentity>) {
      const subject = identity.subject ?? simpleHash(JSON.stringify(identity));
      return withAuth(new AuthFake({ ...identity, subject }));
    },
    ...withAuth(new AuthFake()),
  } as any;
};

function withAuth(auth: AuthFake) {
  return {
    query: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);
      const q = queryGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = { ...ctx, auth };
          return func(testCtx, a);
        },
      });
      // @ts-ignore
      const rawResult = await q.invokeQuery(JSON.stringify([args]));
      return jsonToConvex(JSON.parse(rawResult));
    },

    mutation: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);

      const q = mutationGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = { ...ctx, auth };
          return func(testCtx, a);
        },
      });
      // @ts-ignore
      const rawResult = await q.invokeMutation(JSON.stringify([args]));
      return jsonToConvex(JSON.parse(rawResult));
    },

    action: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);

      const q = actionGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = { ...ctx, auth };
          return func(testCtx, a);
        },
      });
      // @ts-ignore
      const rawResult = await q.invokeAction(
        "" + Math.random(),
        JSON.stringify([args])
      );
      return jsonToConvex(JSON.parse(rawResult));
    },

    run: async (handler: (ctx: any) => any) => {
      const q = mutationGeneric({
        handler: (ctx: any) => {
          const testCtx = { ...ctx, auth };
          return handler(testCtx);
        },
      });
      // @ts-ignore
      const rawResult = await q.invokeMutation(JSON.stringify([{}]));
      return jsonToConvex(JSON.parse(rawResult));
    },
  };
}

async function getFunctionFromReference(
  functionReference: FunctionReference<any, any, any, any>
) {
  return await getFunctionFromName(getFunctionName(functionReference));
}

async function getFunctionFromName(functionName: string) {
  const [modulePath, exportName] = functionName.split(":");
  const module = await import("./convex/" + modulePath);
  return module[exportName];
}

function simpleHash(string: string) {
  let hash = 0;
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}
