import {
  DataModelFromSchemaDefinition,
  DocumentByName,
  FunctionReference,
  FunctionReturnType,
  GenericDataModel,
  GenericDocument,
  GenericMutationCtx,
  GenericSchema,
  OptionalRestArgs,
  SchemaDefinition,
  StorageActionWriter,
  SystemDataModel,
  UserIdentity,
  actionGeneric,
  getFunctionName,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import {
  GenericId,
  JSONValue,
  Value,
  convexToJson,
  jsonToConvex,
} from "convex/values";
import { createHash } from "crypto";

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

type SerializedRangeExpression = {
  type: "Eq" | "Gt" | "Gte" | "Lt" | "Lte";
  fieldPath: string;
  value: JSONValue;
};

type SerializedSearchFilter =
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

type StoredDocument = GenericDocument & {
  _id: DocumentId;
  _creationTime: number;
};

type Index = {
  indexDescriptor: string;
  fields: string[];
};

type VectorIndex = {
  indexDescriptor: string;
  vectorField: string;
  dimensions: number;
  filterFields: string[];
};

type QueryId = number;

type TableName = string;

type DocumentId = GenericId<TableName>;

class DatabaseFake {
  private _documents: Record<DocumentId, StoredDocument> = {};
  private _storage: Record<DocumentId, Blob> = {};
  private _nextQueryId: QueryId = 1;
  private _nextDocId: number = 10000;
  private _lastCreationTime: number = 0;
  private _queryResults: Record<QueryId, Array<GenericDocument>> = {};
  // TODO: Make this more robust and cleaner
  jobListener: (jobId: string) => void = () => {};
  private _writes: Record<
    DocumentId,
    | { newValue: StoredDocument; isInsert: true }
    | { newValue: StoredDocument | null; isInsert: false }
  > = {};
  // The DatabaseFake is used in the Convex global,
  // and so it restricts `convexTest` to run one function
  // at a time.
  // We force sequential execution to make sure actions
  // can run mutations in parallel.
  private _waitOnCurrentFunction: Promise<void> | null = null;

  private _schema: {
    schemaValidation: boolean;
    tables: Map<
      string,
      {
        indexes: Index[];
        vectorIndexes: VectorIndex[];
        documentType: ValidatorJSON;
      }
    >;
  } | null;

  constructor(schema: SchemaDefinition<GenericSchema, boolean> | null) {
    this._schema =
      schema === null
        ? null
        : {
            schemaValidation: (schema as any).schemaValidation,
            tables: new Map(
              Object.entries(schema.tables).map(([name, tableSchema]) => [
                name,
                (tableSchema as any).export(),
              ])
            ),
          };
  }

  async startTransaction() {
    if (this._waitOnCurrentFunction !== null) {
      await this._waitOnCurrentFunction;
    }
    let markTransactionDone: () => void;
    this._waitOnCurrentFunction = new Promise((resolve) => {
      markTransactionDone = resolve;
    });
    return markTransactionDone!;
  }

  endTransaction(token: () => void) {
    token();
    this._waitOnCurrentFunction = null;
  }

  // Used to distinguish between mutation and action execution
  // environment.
  isInTransaction() {
    return this._waitOnCurrentFunction !== null;
  }

  get(id: GenericId<string>) {
    if (typeof id !== "string") {
      throw new Error(
        `Invalid argument \`id\` for \`db.get\`, expected string but got '${typeof id}': ${
          id as any
        }`
      );
    }

    const write = this._writes[id];
    if (write !== undefined) {
      return write.newValue;
    }

    return this._documents[id] ?? null;
  }

  // Note that this is not the format the real backend
  // uses for IDs.
  private _generateId<TableName extends string>(
    table: TableName
  ): GenericId<TableName> {
    const id = this._nextDocId.toString() + ";" + table;
    this._nextDocId += 1;
    return id as GenericId<TableName>;
  }

  storeFile(storageId: GenericId<"_storage">, blob: Blob) {
    this._storage[storageId] = blob;
  }

  getFile(storageId: GenericId<"_storage">) {
    if (this.get(storageId) === null) {
      return null;
    }
    return this._storage[storageId];
  }

  insert<Table extends TableName>(table: Table, value: any) {
    this._validate(table, value);
    const _id = this._generateId(table);
    const now = Date.now();
    const _creationTime =
      now <= this._lastCreationTime ? this._lastCreationTime + 0.001 : now;
    this._lastCreationTime = _creationTime;
    this._writes[_id] = {
      newValue: { ...value, _id, _creationTime },
      isInsert: true,
    };
    return _id;
  }

  patch(id: DocumentId, value: Record<string, any>) {
    const document = this.get(id);
    if (document === null) {
      throw new Error(`Patch on non-existent document with ID "${id}"`);
    }
    const { _id, _creationTime, ...fields } = document;
    const merged = { ...fields, ...value };
    this._validate(tableNameFromId(_id as string)!, merged);
    this._writes[id] = {
      newValue: { _id, _creationTime, ...merged },
      isInsert: false,
    };
  }

  replace(id: DocumentId, value: Record<string, any>) {
    const document = this.get(id);
    if (document === null) {
      throw new Error(`Replace on non-existent document with ID "${id}"`);
    }
    if (value._id !== undefined && value._id !== document._id) {
      throw new Error(
        `Value passed to replace must include the same \`_id\`, got "${value._id}"`
      );
    }
    this._validate(tableNameFromId(document._id as string)!, value);
    this._writes[id] = {
      newValue: {
        ...value,
        _id: document._id,
        _creationTime: document._creationTime,
      },
      isInsert: false,
    };
  }

  delete(id: DocumentId) {
    const document = this.get(id);
    if (document === null) {
      throw new Error("Delete on non-existent doc");
    }
    this._writes[id] = { newValue: null, isInsert: false };
  }

  commit() {
    for (const [id, { newValue }] of Object.entries(this._writes)) {
      if (newValue === null) {
        delete this._documents[id as DocumentId];
      } else {
        this._documents[id as DocumentId] = newValue;
      }
    }
    this.resetWrites();
  }

  resetWrites() {
    this._writes = {};
  }

  _validate(tableName: string, doc: GenericDocument) {
    if (this._schema === null || !this._schema.schemaValidation) {
      return;
    }
    const validator = this._schema.tables.get(tableName)?.documentType;
    if (validator === undefined) {
      return;
    }
    validateValidator(validator, doc);
  }

  startQuery(query: SerializedQuery) {
    const id = this._nextQueryId;
    const results = this._evaluateQuery(query);
    this._queryResults[id] = results;
    this._nextQueryId += 1;
    return id;
  }

  queryNext(queryId: QueryId) {
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
    const queryId = this.startQuery(query);
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

  private _iterateDocs(
    tableName: string,
    callback: (doc: GenericDocument) => void
  ) {
    for (const write of Object.values(this._writes)) {
      if (write.isInsert) {
        const document = write.newValue;
        if (tableNameFromId(document._id) === tableName) {
          callback(document);
        }
      }
    }
    for (const document of Object.values(this._documents)) {
      if (tableNameFromId(document._id) === tableName) {
        const write = this._writes[document._id];
        if (write !== undefined && !write.isInsert && write.newValue !== null) {
          callback(write.newValue);
        } else {
          callback(document);
        }
      }
    }
  }

  private _evaluateQuery(query: SerializedQuery): Array<GenericDocument> {
    const source = query.source;
    let results: GenericDocument[] = [];
    let fieldPathsToSortBy = ["_creationTime"];
    let order = "asc";
    switch (source.type) {
      case "FullTableScan": {
        const tableName = source.tableName;
        this._iterateDocs(tableName, (doc) => {
          results.push(doc);
        });
        order = source.order ?? "asc";

        break;
      }
      case "IndexRange": {
        const [tableName, indexName] = source.indexName.split(".");
        this._iterateDocs(tableName, (doc) => {
          if (
            source.range.every((filter) => evaluateRangeFilter(doc, filter))
          ) {
            results.push(doc);
          }
        });
        const indexes = this._schema?.tables.get(tableName)?.indexes;
        const index = indexes?.find(
          ({ indexDescriptor }: { indexDescriptor: string }) =>
            indexDescriptor === indexName
        );
        if (index === undefined) {
          throw new Error(
            `Cannot use index "${indexName}" for table "${tableName}" because ` +
              `it is not declared in the schema.`
          );
        }
        fieldPathsToSortBy = index.fields;
        order = source.order ?? "asc";
        break;
      }
      case "Search": {
        const [tableName] = source.indexName.split(".");
        this._iterateDocs(tableName, (doc) => {
          if (
            source.filters.every((filter) => evaluateSearchFilter(doc, filter))
          ) {
            results.push(doc);
          }
        });
        order = "asc";
        break;
      }
    }
    const filters = query.operators
      .filter(
        (operator): operator is { filter: FilterJson } => "filter" in operator
      )
      .map((operator) => operator.filter);

    const limit =
      query.operators.filter(
        (operator): operator is { limit: number } => "limit" in operator
      )[0] ?? null;

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

  vectorSearch(
    tableAndIndexName: string,
    vector: number[],
    expressions: SerializedRangeExpression[],
    limit: number
  ) {
    const results: GenericDocument[] = [];
    const [tableName, indexName] = tableAndIndexName.split(".");
    this._iterateDocs(tableName, (doc) => {
      if (expressions.every((filter) => evaluateFilter(doc, filter))) {
        results.push(doc);
      }
    });
    const vectorIndexes = this._schema?.tables.get(tableName)?.vectorIndexes;
    const vectorIndex = vectorIndexes?.find(
      ({ indexDescriptor }: { indexDescriptor: string }) =>
        indexDescriptor === indexName
    );
    if (vectorIndex === undefined) {
      throw new Error(
        `Cannot use vector index "${indexName}" for table "${tableName}" because ` +
          `it is not declared in the schema.`
      );
    }
    const { vectorField } = vectorIndex;
    const idsAndScores = results.map((doc) => {
      const score = cosineSimilarity(vector, doc[vectorField] as number[]);
      return { _id: doc._id, _score: score };
    });
    idsAndScores.sort((a, b) => b._score - a._score);
    return idsAndScores.slice(0, limit);
  }
}

function tableNameFromId(id: string) {
  const parts = id.split(";");
  if (parts.length !== 2) {
    return null;
  }
  return id.split(";")[1];
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

function isSimpleObject(value: unknown) {
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

function evaluateSearchFilter(
  document: GenericDocument,
  filter: SerializedSearchFilter
) {
  const result = evaluateFieldPath(filter.fieldPath, document);
  switch (filter.type) {
    case "Eq":
      return result === filter.value;
    case "Search":
      return (result as string)
        .split(/\s/)
        .some((word) => word.startsWith(filter.value));
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  } else {
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

type ObjectFieldType = { fieldType: ValidatorJSON; optional: boolean };

type ValidatorJSON =
  | {
      type: "null";
    }
  | { type: "number" }
  | { type: "bigint" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "bytes" }
  | { type: "any" }
  | {
      type: "literal";
      value: JSONValue;
    }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJSON }
  | { type: "object"; value: Record<string, ObjectFieldType> }
  | { type: "union"; value: ValidatorJSON[] };

function validateValidator(validator: ValidatorJSON, value: any) {
  switch (validator.type) {
    case "null": {
      if (value !== null) {
        throw new Error(`Validator error: Expected \`null\`, got \`${value}\``);
      }
      return;
    }
    case "number": {
      if (typeof value !== "number") {
        throw new Error(
          `Validator error: Expected \`number\`, got \`${value}\``
        );
      }
      return;
    }
    case "bigint": {
      if (typeof value !== "bigint") {
        throw new Error(
          `Validator error: Expected \`bigint\`, got \`${value}\``
        );
      }
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new Error(
          `Validator error: Expected \`boolean\`, got \`${value}\``
        );
      }
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        throw new Error(
          `Validator error: Expected \`string\`, got \`${value}\``
        );
      }
      return;
    }
    case "bytes": {
      if (!(value instanceof ArrayBuffer)) {
        throw new Error(
          `Validator error: Expected \`ArrayBuffer\`, got \`${value}\``
        );
      }
      return;
    }
    case "any": {
      return;
    }
    case "literal": {
      if (value !== validator.value) {
        throw new Error(
          `Validator error: Expected \`${
            validator.value as any
          }\`, got \`${value}\``
        );
      }
      return;
    }
    case "id": {
      if (typeof value !== "string") {
        throw new Error(
          `Validator error: Expected \`string\`, got \`${value}\``
        );
      }
      if (tableNameFromId(value) !== validator.tableName) {
        throw new Error(
          `Validator error: Expected ID for table ${validator.tableName}, got \`${value}\``
        );
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        throw new Error(
          `Validator error: Expected \`Array\`, got \`${value}\``
        );
      }
      for (const v of value) {
        validateValidator(validator.value, v);
      }
      return;
    }
    case "object": {
      if (typeof value !== "object") {
        throw new Error(
          `Validator error: Expected \`object\`, got \`${value}\``
        );
      }
      if (!isSimpleObject(value)) {
        throw new Error(
          `Validator error: Expected a plain old JavaScript \`object\`, got \`${value}\``
        );
      }
      for (const [k, { fieldType, optional }] of Object.entries(
        validator.value
      )) {
        if (value[k] === undefined) {
          if (!optional) {
            throw new Error(
              `Validator error: Missing required field \`${k}\` in object`
            );
          }
        } else {
          validateValidator(fieldType, value[k]);
        }
      }
      for (const k of Object.keys(value)) {
        if (validator.value[k] === undefined) {
          throw new Error(
            `Validator error: Unexpected field \`${k}\` in object`
          );
        }
      }
      return;
    }
  }
}

function syscallImpl(db: DatabaseFake) {
  return (op: string, jsonArgs: string) => {
    const args = JSON.parse(jsonArgs);
    switch (op) {
      case "1.0/queryStream": {
        const { query } = args;
        const queryId = db.startQuery(query);
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
      case "1.0/actions/schedule": {
        return await withAuth().run(async () => {
          return await getSyscalls().asyncSyscall("1.0/schedule", jsonArgs);
        });
      }
      case "1.0/schedule": {
        const { name, args: fnArgs, ts: tsInSecs } = args;
        const jobId = db.insert("_scheduled_functions", {
          args: [fnArgs],
          name,
          scheduledTime: tsInSecs * 1000,
          state: { kind: "pending" },
        });
        setTimeout(
          (async () => {
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
          }) as () => void,
          tsInSecs * 1000 - Date.now()
        );
        return JSON.stringify(convexToJson(jobId));
      }
      case "1.0/actions/cancel_job": {
        await withAuth().run(async () => {
          await getSyscalls().asyncSyscall("1.0/cancel_job", jsonArgs);
        });
        return JSON.stringify({});
      }
      case "1.0/actions/vectorSearch": {
        const {
          query: { indexName, limit, vector, expressions },
        } = args;
        const results = db.vectorSearch(
          indexName,
          vector,
          // Probably an unintentional implementation in Convex
          // where expressions is only a single expression
          expressions === null ? [] : [expressions],
          limit
        );
        return JSON.stringify(convexToJson({ results }));
      }
      case "1.0/cancel_job": {
        const { id } = args;
        db.patch(id, { state: { kind: "canceled" } });
        return JSON.stringify({});
      }
      case "1.0/storageDelete": {
        const { storageId } = args;
        await writeToDatabase(async (db) => {
          db.delete(storageId);
        });
        return JSON.stringify({});
      }
      case "1.0/storageGetUrl": {
        const { storageId } = args;
        const metadata = db.get(storageId);
        if (metadata === null) {
          return JSON.stringify(null);
        }
        const { sha256 } = metadata;
        // In the real backend the URL ofc isn't the sha
        const url =
          "https://some-deployment.convex.cloud/api/storage/" +
          (sha256 as string);
        return JSON.stringify(convexToJson(url));
      }
      case "1.0/storageGenerateUploadUrl": {
        // In the real backend the token is cryptographically secure
        const url =
          "https://some-deployment.convex.cloud/api/storage/upload?token=" +
          Math.random();
        return JSON.stringify(convexToJson(url));
      }
      default: {
        throw new Error(
          `\`convexTest\` does not support async syscall: "${op}"`
        );
      }
    }
  };
}

function jsSyscallImpl(db: DatabaseFake) {
  return async (op: string, args: Record<string, any>): Promise<any> => {
    switch (op) {
      case "storage/storeBlob": {
        const { blob } = args as { blob: Blob };
        const storageId = await writeToDatabase(async (db) => {
          return db.insert("_storage", {
            size: blob.size,
            sha256: await blobSha(blob),
          });
        });
        db.storeFile(storageId, blob);
        return storageId;
      }
      case "storage/getBlob": {
        const { storageId } = args as { storageId: GenericId<"_storage"> };
        return db.getFile(storageId);
      }
      default: {
        throw new Error(`\`convexTest\` does not support js syscall: "${op}"`);
      }
    }
  };
}

// If we're in action, wrap the write in a transaction.
async function writeToDatabase<T>(impl: (db: DatabaseFake) => Promise<T>) {
  const db = getDb();
  if (!db.isInTransaction()) {
    return await withAuth().run(async () => {
      return await impl(db);
    });
  } else {
    return await impl(db);
  }
}

async function blobSha(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const sha256 = createHash("sha256");
  sha256.update(Buffer.from(arrayBuffer));
  return sha256.digest("base64");
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
      func: (
        ctx: GenericMutationCtx<DataModel> & { storage: StorageActionWriter }
      ) => Promise<Output>
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
    func: (
      ctx: GenericMutationCtx<DataModel> & { storage: StorageActionWriter }
    ) => Promise<Output>
  ) => Promise<Output>;
  finishInProgressScheduledFunctions: () => Promise<void>;
};

function getDb() {
  return (global as any).Convex.db as DatabaseFake;
}

function getSyscalls() {
  return (global as any).Convex as {
    syscall: ReturnType<typeof syscallImpl>;
    asyncSyscall: ReturnType<typeof asyncSyscallImpl>;
  };
}

// Main entrypoint to the library
export const convexTest = <Schema extends GenericSchema>(
  schema?: SchemaDefinition<Schema, boolean>
): TestConvex<SchemaDefinition<Schema, boolean>> => {
  const db = new DatabaseFake(schema ?? null);
  (global as unknown as { Convex: any }).Convex = {
    syscall: syscallImpl(db),
    asyncSyscall: asyncSyscallImpl(db),
    jsSyscall: jsSyscallImpl(db),
    db,
  };

  return {
    withIdentity(identity: Partial<UserIdentity>) {
      const subject =
        identity.subject ?? "" + simpleHash(JSON.stringify(identity));
      const issuer = identity.issuer ?? "https://convex.test";
      const tokenIdentifier =
        identity.tokenIdentifier ?? `${issuer}|${subject}`;
      return withAuth(
        new AuthFake({ ...identity, subject, issuer, tokenIdentifier })
      );
    },
    ...withAuth(),
  } as any;
};

function withAuth(auth: AuthFake = new AuthFake()) {
  const runTransaction = async <T>(
    handler: (ctx: any, args: any) => T,
    args: any,
    extraCtx: any = {}
  ): Promise<T> => {
    const m = mutationGeneric({
      handler: (ctx: any, a: any) => {
        const testCtx = { ...ctx, auth, ...extraCtx };
        return handler(testCtx, a);
      },
    });
    const markTransactionDone = await getDb().startTransaction();
    try {
      const rawResult = await (
        m as unknown as { invokeMutation: (args: string) => Promise<string> }
      ).invokeMutation(JSON.stringify(convexToJson([parseArgs(args)])));
      getDb().commit();
      return jsonToConvex(JSON.parse(rawResult)) as T;
    } finally {
      getDb().resetWrites();
      getDb().endTransaction(markTransactionDone);
    }
  };

  const byType = {
    query: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);
      validateValidator(JSON.parse(func.exportArgs()), args ?? {});
      const q = queryGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = { ...ctx, auth };
          return func(testCtx, a);
        },
      });
      const markTransactionDone = await getDb().startTransaction();
      try {
        const rawResult = await (
          q as unknown as { invokeQuery: (args: string) => Promise<string> }
        ).invokeQuery(JSON.stringify(convexToJson([parseArgs(args)])));
        return jsonToConvex(JSON.parse(rawResult));
      } finally {
        getDb().endTransaction(markTransactionDone);
      }
    },

    mutation: async (functionReference: any, args: any): Promise<Value> => {
      const func = await getFunctionFromReference(functionReference);
      validateValidator(JSON.parse(func.exportArgs()), args ?? {});
      return await runTransaction(func, args);
    },

    action: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference);
      validateValidator(JSON.parse(func.exportArgs()), args ?? {});

      const a = actionGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = { ...ctx, auth };
          return func(testCtx, a);
        },
      });
      // Real backend uses different ID format
      const requestId = "" + Math.random();
      const rawResult = await (
        a as unknown as {
          invokeAction: (requestId: string, args: string) => Promise<string>;
        }
      ).invokeAction(
        requestId,
        JSON.stringify(convexToJson([parseArgs(args)]))
      );
      return jsonToConvex(JSON.parse(rawResult));
    },
  };
  return {
    ...byType,

    run: async <T>(handler: (ctx: any) => T): Promise<T> => {
      // Grab StorageActionWriter from action ctx
      const a = actionGeneric({
        handler: async ({ storage }: any) => {
          return await runTransaction(handler, {}, { storage });
        },
      });
      // Real backend uses different ID format
      const requestId = "" + Math.random();
      const rawResult = await (
        a as unknown as {
          invokeAction: (requestId: string, args: string) => Promise<string>;
        }
      ).invokeAction(requestId, JSON.stringify(convexToJson([{}])));
      return jsonToConvex(JSON.parse(rawResult)) as T;
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
        getDb().jobListener = () => {
          numRemaining -= 1;
          if (numRemaining === 0) {
            resolve();
          }
        };
      });
    },
  };
}

function parseArgs(
  args: Record<string, Value> | undefined
): Record<string, Value> {
  if (args === undefined) {
    return {};
  }
  if (!isSimpleObject(args)) {
    throw new Error(
      `The arguments to a Convex function must be an object. Received: ${
        args as any
      }`
    );
  }
  return args;
}

async function getFunctionFromReference(
  functionReference: FunctionReference<any, any, any, any>
) {
  return await getFunctionFromName(getFunctionName(functionReference));
}

async function getFunctionFromName(functionName: string) {
  const [modulePath, exportName] = functionName.split(":");
  const module = await import("./convex/" + modulePath);
  const func = module[exportName];
  if (func === undefined) {
    throw new Error(
      `Expected a Convex function exported from module "${modulePath}" as \`${exportName}\`, but there is no such export.`
    );
  }
  if (typeof func !== "function") {
    throw new Error(
      `Expected a Convex function exported from module "${modulePath}" as \`${exportName}\`, but got: ${func}`
    );
  }
  return func;
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
