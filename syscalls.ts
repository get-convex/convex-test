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
  DocumentByName,
  SystemDataModel,
  GenericQueryCtx,
  Indexes,
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

type ScheduledFunction = DocumentByName<
  SystemDataModel,
  "_scheduled_functions"
>;

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
  // TODO: Make this more robust and cleaner
  jobListener: (jobId: string) => void = () => {};

  constructor(
    private _schema: SchemaDefinition<GenericSchema, boolean> | null
  ) {}

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

  patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Record<string, any>
  ) {
    const doc = this._documents[id];
    if (doc === undefined) {
      throw new Error(`Patch on non-existent document with ID "{id}"`);
    }
    const { document, tableName } = doc;
    this._documents[id] = { tableName, document: { ...document, ...value } };
  }

  replace<TableName extends string>(
    id: GenericId<TableName>,
    value: Record<string, any>
  ) {
    const doc = this._documents[id];
    if (doc === undefined) {
      throw new Error("Replace on non-existent doc");
    }
    const { document, tableName } = doc;
    if (value._id !== undefined && value._id !== document._id) {
      throw new Error("_id mismatch");
    }
    this._documents[id] = {
      tableName,
      document: {
        ...value,
        _id: document._id,
        _creationTime: document._creationTime,
      },
    };
  }

  delete(id: GenericId<string>) {
    const doc = this._documents[id];
    if (doc === undefined) {
      throw new Error("Delete on non-existent doc");
    }
    delete this._documents[id];
  }

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
      return { value: results.shift()!, done: false };
    }
  }

  paginate({
    query,
    cursor,
    pageSize,
  }: {
    query: SerializedQuery;
    cursor: string | null;
    pageSize: number;
  }) {
    const queryId = this.startQuery({ query } as any);
    const page = [];
    let isInPage = cursor === null;
    let isDone = false;
    let continueCursor = null;
    for (;;) {
      const { value, done } = this.queryNext(queryId);
      if (done) {
        isDone = true;
        break;
      }
      if (isInPage) {
        page.push(value);
        if (page.length >= pageSize) {
          continueCursor = value!._id;
          break;
        }
      }
      if (value!._id === cursor) {
        isInPage = true;
      }
    }
    return {
      page,
      isDone,
      continueCursor,
    };
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
        fieldPathsToSortBy = (
          this._schema!.tables[tableName] as any
        ).indexes!.find(
          ({ indexDescriptor }: { indexDescriptor: string }) =>
            indexDescriptor === indexName
        ).fields;
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

  jobFinished(jobId: string) {
    this.jobListener(jobId);
  }
}

function compareValues(a: Value | undefined, b: Value | undefined) {
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
  const aType = typeof a;
  const bType = typeof b;
  if (aType !== bType) {
    if (aType === "bigint") {
      return -1;
    }
    if (bType === "bigint") {
      return 1;
    }
    if (aType === "number") {
      return -1;
    }
    if (bType === "number") {
      return 1;
    }
    if (aType === "boolean") {
      return -1;
    }
    if (bType === "boolean") {
      return 1;
    }
    if (aType === "string") {
      return -1;
    }
    if (bType === "string") {
      return 1;
    }
  }
  if (aType === "object") {
    if (a instanceof ArrayBuffer && !(b instanceof ArrayBuffer)) {
      return -1;
    }
    if (b instanceof ArrayBuffer && !(a instanceof ArrayBuffer)) {
      return 1;
    }
    if (Array.isArray(a) && !Array.isArray(b)) {
      return -1;
    }
    if (Array.isArray(b) && !Array.isArray(a)) {
      return 1;
    }
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
      case "1.0/queryStreamNext": {
        const { value, done } = db.queryNext(args.queryId);
        return JSON.stringify(convexToJson({ value, done }));
      }
      case "1.0/queryPage": {
        const { query, cursor, pageSize } = args;
        const { page, isDone, continueCursor } = db.paginate({
          query,
          cursor,
          pageSize,
        });
        return JSON.stringify(convexToJson({ page, isDone, continueCursor }));
      }
      case "1.0/insert": {
        const _id = db.insert(args.table, jsonToConvex(args.value));
        return JSON.stringify({ _id });
      }
      case "1.0/shallowMerge": {
        const { id, value } = args;
        db.patch(id, value);
        return JSON.stringify({});
      }
      case "1.0/replace": {
        const { id, value } = args;
        db.replace(id, value);
        return JSON.stringify({});
      }
      case "1.0/remove": {
        const { id } = args;
        db.delete(id);
        return JSON.stringify({});
      }
      case "1.0/actions/query": {
        const { name, args: queryArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth().query(makeFunctionReference(name), queryArgs)
          )
        );
      }
      case "1.0/actions/mutation": {
        const { name, args: mutationArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth().mutation(makeFunctionReference(name), mutationArgs)
          )
        );
      }
      case "1.0/actions/action": {
        const { name, args: actionArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth().action(makeFunctionReference(name), actionArgs)
          )
        );
      }
      case "1.0/actions/schedule":
      case "1.0/schedule": {
        const { name, args: fnArgs, ts: tsInSecs } = args;
        const jobId = db.insert("_scheduled_functions", {
          args: [fnArgs],
          name,
          scheduledTime: tsInSecs * 1000,
          state: { kind: "pending" },
        });
        setTimeout(async () => {
          {
            const job = db.get(jobId) as ScheduledFunction;
            if (job.state.kind === "canceled") {
              return;
            }
            if (job.state.kind !== "pending") {
              throw new Error(
                `\`convexTest\` invariant error: Unexpected scheduled function state when starting it: ${job.state.kind}`
              );
            }
          }
          db.patch(jobId, { state: { kind: "inProgress" } });
          try {
            await withAuth().fun(makeFunctionReference(name), fnArgs);
          } catch (error) {
            console.error(
              `Error when running scheduled function ${name}`,
              error
            );
            db.patch(jobId, {
              state: { kind: "failed" },
              completedTime: Date.now(),
            });
            db.jobFinished(jobId);
          }
          {
            const job = db.get(jobId) as ScheduledFunction;
            if (job.state.kind !== "inProgress") {
              throw new Error(
                `\`convexTest\` invariant error: Unexpected scheduled function state after it finished running: ${job.state.kind}`
              );
            }
          }
          db.patch(jobId, { state: { kind: "success" } });
          db.jobFinished(jobId);
        }, tsInSecs * 1000 - Date.now());
        return JSON.stringify(convexToJson(jobId));
      }
      case "1.0/actions/cancel_job":
      case "1.0/cancel_job": {
        const { id } = args;
        db.patch(id, { state: { kind: "canceled" } });
        return JSON.stringify({});
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
    finishInProgressScheduledFunctions: () => Promise<void>;
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
  finishInProgressScheduledFunctions: () => Promise<void>;
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

  const jobListener = {
    // This is needed because when we execute functions
    // we are performing dynamic `import`s, and those
    // are real work that cannot be force-awaited.
    finishInProgressScheduledFunctions: async (): Promise<void> => {
      const inProgressJobs = (await withAuth().run(async (ctx) => {
        return (
          await ctx.db.system.query("_scheduled_functions").collect()
        ).filter((job: ScheduledFunction) => job.state.kind === "inProgress");
      })) as ScheduledFunction[];
      let numRemaining = inProgressJobs.length;
      if (numRemaining === 0) {
        return;
      }

      return new Promise((resolve) => {
        db.jobListener = () => {
          numRemaining -= 1;
          if (numRemaining === 0) {
            resolve();
          }
        };
      });
    },
  };

  return {
    withIdentity(identity: Partial<UserIdentity>) {
      const subject = identity.subject ?? simpleHash(JSON.stringify(identity));
      return {
        ...withAuth(new AuthFake({ ...identity, subject })),
        ...jobListener,
      };
    },
    ...withAuth(),
    ...jobListener,
  } as any;
};

function withAuth(auth: AuthFake = new AuthFake()) {
  const byType = {
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
  };
  return {
    ...byType,

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

    fun: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);
      if (func.isQuery) {
        return await byType.query(functionReference, args);
      }
      if (func.isMutation) {
        return await byType.mutation(functionReference, args);
      }
      if (func.isAction) {
        return await byType.action(functionReference, args);
      }
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
