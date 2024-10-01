/// <reference types="vite/client" />

import {
  DataModelFromSchemaDefinition,
  DocumentByName,
  FunctionReference,
  FunctionReturnType,
  GenericDataModel,
  GenericDocument,
  GenericMutationCtx,
  GenericSchema,
  HttpRouter,
  OptionalRestArgs,
  SchemaDefinition,
  StorageActionWriter,
  SystemDataModel,
  UserIdentity,
  actionGeneric,
  getFunctionName,
  httpActionGeneric,
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
import { compareValues } from "./compare";

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
              ]),
            ),
          };

    this.validateSchema();
  }

  async startTransaction() {
    // Note the loop is important, as the current promise might resolve and a
    // new transaction could start before we get woken up.
    // This is the standard pattern for condition variables:
    // https://en.wikipedia.org/wiki/Monitor_(synchronization)
    while (this._waitOnCurrentFunction !== null) {
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
    const { document } = this.getForWrite(id);
    return document;
  }

  getForWrite(id: GenericId<string>) {
    if (typeof id !== "string") {
      throw new Error(
        `Invalid argument \`id\` for \`db.get\`, expected string but got '${typeof id}': ${
          id as any
        }`,
      );
    }

    const write = this._writes[id];
    if (write !== undefined) {
      return { document: write.newValue, isInsert: write.isInsert };
    }

    return { document: this._documents[id] ?? null, isInsert: false };
  }

  // Note that this is not the format the real backend
  // uses for IDs.
  private _generateId<TableName extends string>(
    table: TableName,
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
    const { document, isInsert } = this.getForWrite(id);
    if (document === null) {
      throw new Error(`Patch on non-existent document with ID "${id}"`);
    }
    const { _id, _creationTime, ...fields } = document;
    if (value._id !== undefined && value._id !== _id) {
      throw new Error(
        `Provided \`_id\` field value "${value._id}" ` +
          `does not match the document ID "${_id}"`,
      );
    }
    if (
      value._creationTime !== undefined &&
      value._creationTime !== _creationTime
    ) {
      throw new Error(
        `Provided \`_creationTime\` field value ${value._creationTime} ` +
          `does not match the document's creation time ${_creationTime}`,
      );
    }
    delete value["_id"];
    delete value["_creationTime"];
    const convexValue: any = {};
    for (const [key, v] of Object.entries(value)) {
      convexValue[key] = evaluateValue(v);
    }
    const merged = { ...fields, ...convexValue };
    this._validate(tableNameFromId(_id as string)!, merged);
    this._writes[id] = {
      newValue: { _id, _creationTime, ...merged },
      isInsert,
    };
  }

  replace(id: DocumentId, value: Record<string, any>) {
    const { document, isInsert } = this.getForWrite(id);
    if (document === null) {
      throw new Error(`Replace on non-existent document with ID "${id}"`);
    }
    if (value._id !== undefined && value._id !== document._id) {
      throw new Error(
        `Provided \`_id\` field value "${value._id}" ` +
          `does not match the document ID "${document._id}"`,
      );
    }
    if (
      value._creationTime !== undefined &&
      value._creationTime !== document._creationTime
    ) {
      throw new Error(
        `Provided \`_creationTime\` field value ${value._creationTime} ` +
          `does not match the document's creation time ${document._creationTime}`,
      );
    }
    delete value["_id"];
    delete value["_creationTime"];
    const convexValue: any = {};
    for (const [key, v] of Object.entries(value)) {
      convexValue[key] = evaluateValue(v);
    }
    this._validate(tableNameFromId(document._id as string)!, convexValue);
    this._writes[id] = {
      newValue: {
        ...convexValue,
        _id: document._id,
        _creationTime: document._creationTime,
      },
      isInsert,
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
        // We have reached the end of the query. Return a cursor that indicates
        // "end query", which we can do with any string that isn't a valid _id.
        continueCursor = "_end_cursor";
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
    callback: (doc: GenericDocument) => void,
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
        if (write === undefined) {
          callback(document);
        } else if (!write.isInsert && write.newValue !== null) {
          callback(write.newValue);
        }
      }
    }
  }

  private _evaluateQuery(query: SerializedQuery): Array<GenericDocument> {
    const source = query.source;
    let results: GenericDocument[] = [];
    let fieldPathsToSortBy: string[];
    let order: "asc" | "desc";
    switch (source.type) {
      case "FullTableScan": {
        const tableName = source.tableName;
        this._iterateDocs(tableName, (doc) => {
          results.push(doc);
        });
        order = source.order ?? "asc";
        fieldPathsToSortBy = ["_creationTime"];

        break;
      }
      case "IndexRange": {
        const [tableName, indexName] = source.indexName.split(".");
        order = source.order ?? "asc";
        let fields;
        if (indexName === "by_creation_time") {
          fields = ["_creationTime", "_id"];
        } else if (indexName === "by_id") {
          fields = ["_id"];
        } else {
          const indexes = this._schema?.tables.get(tableName)?.indexes;
          const index = indexes?.find(
            ({ indexDescriptor }: { indexDescriptor: string }) =>
              indexDescriptor === indexName,
          );
          if (index === undefined) {
            throw new Error(
              `Cannot use index "${indexName}" for table "${tableName}" because ` +
                `it is not declared in the schema.`,
            );
          }
          fields = index.fields.concat(["_creationTime", "_id"]);
        }
        fieldPathsToSortBy = fields;

        validateIndexRangeExpression(source, fields);

        this._iterateDocs(tableName, (doc) => {
          if (
            source.range.every((filter) => evaluateRangeFilter(doc, filter))
          ) {
            results.push(doc);
          }
        });
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
        fieldPathsToSortBy = [];
        order = "asc";
        break;
      }
    }
    const filters = query.operators
      .filter(
        (operator): operator is { filter: FilterJson } => "filter" in operator,
      )
      .map((operator) => operator.filter);

    const limit =
      query.operators.filter(
        (operator): operator is { limit: number } => "limit" in operator,
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
    limit: number,
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
        indexDescriptor === indexName,
    );
    if (vectorIndex === undefined) {
      throw new Error(
        `Cannot use vector index "${indexName}" for table "${tableName}" because ` +
          `it is not declared in the schema.`,
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

  validateSchema() {
    this._schema?.tables.forEach((table, tableName) => {
      if (!isValidIdentifier(tableName)) {
        throw new Error(
          `Table names must be valid identifiers, got "${tableName}"`,
        );
      }

      validateFieldNames(table.documentType);

      table.indexes.forEach(({ indexDescriptor }) => {
        if (!isValidIdentifier(indexDescriptor)) {
          throw new Error(
            `Index names must be valid identifiers, got "${indexDescriptor}"`,
          );
        }
      });
    });
  }
}

function tableNameFromId(id: string) {
  const parts = id.split(";");
  if (parts.length !== 2) {
    return null;
  }
  return id.split(";")[1];
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
    result =
      result !== undefined && result !== null && isSimpleObject(result)
        ? (result as any)[p]
        : undefined;
  }
  return result;
}

function evaluateFilter(
  document: GenericDocument,
  filter: any,
): Value | undefined {
  if (filter.$eq !== undefined) {
    return compareValues(
      evaluateFilter(document, filter.$eq[0]),
      evaluateFilter(document, filter.$eq[1])
    ) === 0;
  }
  if (filter.$neq !== undefined) {
    return compareValues(
      evaluateFilter(document, filter.$neq[0]),
      evaluateFilter(document, filter.$neq[1])
    ) !== 0;
  }
  if (filter.$and !== undefined) {
    return filter.$and.every((child: any) => evaluateFilter(document, child));
  }
  if (filter.$or !== undefined) {
    return filter.$or.some((child: any) => evaluateFilter(document, child));
  }
  if (filter.$not !== undefined) {
    return !evaluateFilter(document, filter.$not);
  }
  if (filter.$gt !== undefined) {
    return (
      evaluateFilter(document, filter.$gt[0])! >
      evaluateFilter(document, filter.$gt[1])!
    );
  }
  if (filter.$gte !== undefined) {
    return (
      evaluateFilter(document, filter.$gte[0])! >=
      evaluateFilter(document, filter.$gte[1])!
    );
  }
  if (filter.$lt !== undefined) {
    return (
      evaluateFilter(document, filter.$lt[0])! <
      evaluateFilter(document, filter.$lt[1])!
    );
  }
  if (filter.$lte !== undefined) {
    return (
      evaluateFilter(document, filter.$lte[0])! <=
      evaluateFilter(document, filter.$lte[1])!
    );
  }
  if (filter.$add !== undefined) {
    return (
      (evaluateFilter(document, filter.$add[0]) as number) +
      (evaluateFilter(document, filter.$add[1]) as number)
    );
  }
  if (filter.$sub !== undefined) {
    return (
      (evaluateFilter(document, filter.$sub[0]) as number) -
      (evaluateFilter(document, filter.$sub[1]) as number)
    );
  }
  if (filter.$mul !== undefined) {
    return (
      (evaluateFilter(document, filter.$mul[0]) as number) *
      (evaluateFilter(document, filter.$mul[1]) as number)
    );
  }
  if (filter.$div !== undefined) {
    return (
      (evaluateFilter(document, filter.$div[0]) as number) /
      (evaluateFilter(document, filter.$div[1]) as number)
    );
  }
  if (filter.$mod !== undefined) {
    return (
      (evaluateFilter(document, filter.$mod[0]) as number) %
      (evaluateFilter(document, filter.$mod[1]) as number)
    );
  }
  if (filter.$field !== undefined) {
    return evaluateFieldPath(filter.$field, document);
  }
  if (filter.$literal !== undefined) {
    return evaluateValue(filter.$literal);
  }
  throw new Error(`not implemented: ${JSON.stringify(filter)}`);
}

function evaluateRangeFilter(
  document: GenericDocument,
  expr: SerializedRangeExpression,
) {
  const result = evaluateFieldPath(expr.fieldPath, document);
  const value = evaluateValue(expr.value);
  switch (expr.type) {
    case "Eq":
      return compareValues(result, value) === 0;
    case "Gt":
      return compareValues(result, value) > 0;
    case "Gte":
      return compareValues(result, value) >= 0;
    case "Lt":
      return compareValues(result, value) < 0;
    case "Lte":
      return compareValues(result, value) <= 0;
  }
}

function evaluateValue(value: JSONValue) {
  if (typeof value === "object" && value !== null && "$undefined" in value) {
    return undefined;
  }
  return jsonToConvex(value);
}

function evaluateSearchFilter(
  document: GenericDocument,
  filter: SerializedSearchFilter,
) {
  const result = evaluateFieldPath(filter.fieldPath, document);
  switch (filter.type) {
    case "Eq":
      return compareValues(result, filter.value) === 0;
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

// An index range expression is always a chained list of:
//
// 0 or more equality expressions defined with .eq.
// [Optionally] A lower bound expression defined with .gt or .gte.
// [Optionally] An upper bound expression defined with .lt or .lte.
function validateIndexRangeExpression(
  source: Source & { type: "IndexRange" },
  fields: string[],
) {
  let fieldIndex = 0;
  let state: "eq" | "gt" | "lt" | "done" = "eq";
  for (const [filterIndex, filter] of source.range.entries()) {
    if (state === "done") {
      throw new Error(
        `Incorrect operator used in \`withIndex\`, cannot chain ` +
          `more operators after both \`.gt\` and \`.lt\` were already used, ` +
          `got \`${printIndexOperator(filter)}\`.`,
      );
    }

    const filterType: "eq" | "gt" | "lt" =
      filter.type == "Gt" || filter.type == "Gte"
        ? "gt"
        : filter.type == "Lt" || filter.type == "Lte"
          ? "lt"
          : "eq";

    switch (`${state}|${filterType}`) {
      // Allow to operate on the current indexed field
      case "eq|eq":
      case "eq|gt":
      case "eq|lt":
        if (filter.fieldPath === fields[fieldIndex]) {
          fieldIndex += 1;
          state = filterType;
          continue;
        }
        throw new Error(
          `Incorrect field used in \`withIndex\`, ` +
            `expected "${fields[fieldIndex]}", got "${filter.fieldPath}"`,
        );

      // Allow to operate on the previous field (gt and lt must operate on same field)
      case "lt|gt":
      case "gt|lt":
        if (fieldIndex > 0 && filter.fieldPath === fields[fieldIndex - 1]) {
          state = "done";
          continue;
        }
        throw new Error(
          `Incorrect field used in \`withIndex\`, ` +
            `\`.gt\` and \`.lt\` must operate on the same field, ` +
            `expected "${fields[fieldIndex - 1]}", got "${filter.fieldPath}"`,
        );

      default:
        throw new Error(
          `Incorrect operator used in \`withIndex\`, ` +
            `cannot chain \`.${filter.type.toLowerCase()}()\` ` +
            `after \`.${source.range[filterIndex - 1].type.toLowerCase()}()\``,
        );
    }
  }
}

function printIndexOperator(filter: SerializedRangeExpression) {
  return `.${filter.type.toLowerCase()}(${filter.fieldPath}, ${JSON.stringify(filter.value)})`;
}

function validateFieldNames(validator: ValidatorJSON) {
  validator.type === "object" &&
    Object.keys(validator.value).forEach((fieldName) => {
      if (!isValidIdentifier(fieldName)) {
        throw new Error(
          `Field names must be valid identifiers, got "${fieldName}"`,
        );
      }
    });
  validator.type === "union" && validator.value.forEach(validateFieldNames);
}

function isValidIdentifier(name: string) {
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
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
          `Validator error: Expected \`number\`, got \`${value}\``,
        );
      }
      return;
    }
    case "bigint": {
      if (typeof value !== "bigint") {
        throw new Error(
          `Validator error: Expected \`bigint\`, got \`${value}\``,
        );
      }
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new Error(
          `Validator error: Expected \`boolean\`, got \`${value}\``,
        );
      }
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        throw new Error(
          `Validator error: Expected \`string\`, got \`${value}\``,
        );
      }
      return;
    }
    case "bytes": {
      if (!(value instanceof ArrayBuffer)) {
        throw new Error(
          `Validator error: Expected \`ArrayBuffer\`, got \`${value}\``,
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
          }\`, got \`${value}\``,
        );
      }
      return;
    }
    case "id": {
      if (typeof value !== "string") {
        throw new Error(
          `Validator error: Expected \`string\`, got \`${value}\``,
        );
      }
      if (tableNameFromId(value) !== validator.tableName) {
        throw new Error(
          `Validator error: Expected ID for table "${validator.tableName}", got \`${value}\``,
        );
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        throw new Error(
          `Validator error: Expected \`Array\`, got \`${value}\``,
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
          `Validator error: Expected \`object\`, got \`${value}\``,
        );
      }
      if (!isSimpleObject(value)) {
        throw new Error(
          `Validator error: Expected a plain old JavaScript \`object\`, got \`${value}\``,
        );
      }
      for (const [k, { fieldType, optional }] of Object.entries(
        validator.value,
      )) {
        if (value[k] === undefined) {
          if (!optional) {
            throw new Error(
              `Validator error: Missing required field \`${k}\` in object`,
            );
          }
        } else {
          validateValidator(fieldType, value[k]);
        }
      }
      for (const k of Object.keys(value)) {
        if (validator.value[k] === undefined) {
          throw new Error(
            `Validator error: Unexpected field \`${k}\` in object`,
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
      case "1.0/db/normalizeId": {
        const idString: string = args.idString;
        const isInTable = idString.endsWith(`;${args.table}`);
        return JSON.stringify({
          id: isInTable ? idString : null,
        });
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
        db.patch(id, jsonToConvex(value));
        return JSON.stringify({});
      }
      case "1.0/replace": {
        const { id, value } = args;
        db.replace(id, jsonToConvex(value));
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
            await withAuth().query(makeFunctionReference(name), queryArgs),
          ),
        );
      }
      case "1.0/actions/mutation": {
        const { name, args: mutationArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth().mutation(
              makeFunctionReference(name),
              mutationArgs,
            ),
          ),
        );
      }
      case "1.0/actions/action": {
        const { name, args: actionArgs } = args;
        return JSON.stringify(
          convexToJson(
            await withAuth().action(makeFunctionReference(name), actionArgs),
          ),
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
                  `\`convexTest\` invariant error: Unexpected scheduled function state when starting it: ${job.state.kind}`,
                );
              }
            }
            db.patch(jobId, { state: { kind: "inProgress" } });
            try {
              await withAuth().fun(makeFunctionReference(name), fnArgs);
            } catch (error) {
              console.error(
                `Error when running scheduled function ${name}`,
                error,
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
                  `\`convexTest\` invariant error: Unexpected scheduled function state after it finished running: ${job.state.kind}`,
                );
              }
            }
            db.patch(jobId, { state: { kind: "success" } });
            db.jobFinished(jobId);
          }) as () => void,
          tsInSecs * 1000 - Date.now(),
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
          limit,
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
          `\`convexTest\` does not support async syscall: "${op}"`,
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

async function waitForInProgressScheduledFunctions(): Promise<boolean> {
  const inProgressJobs = (await withAuth().run(async (ctx) => {
    return (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (job: ScheduledFunction) => job.state.kind === "inProgress",
    );
  })) as ScheduledFunction[];
  let numRemaining = inProgressJobs.length;
  if (numRemaining === 0) {
    return false;
  }

  await new Promise<void>((resolve) => {
    getDb().jobListener = () => {
      numRemaining -= 1;
      if (numRemaining === 0) {
        resolve();
      }
    };
  });
  return true;
}

export type TestConvex<SchemaDef extends SchemaDefinition<any, boolean>> =
  TestConvexForDataModelAndIdentity<DataModelFromSchemaDefinition<SchemaDef>>;

export type TestConvexForDataModel<DataModel extends GenericDataModel> = {
  /**
   * Call a public or internal query.
   *
   * @param query A {@link FunctionReference} for the query.
   * @param args  An arguments object for the query. If this is omitted,
   *   the arguments will be `{}`.
   * @returns A `Promise` of the query's result.
   */
  query: <Query extends FunctionReference<"query", any>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Promise<FunctionReturnType<Query>>;

  /**
   * Call a public or internal mutation.
   *
   * @param mutation A {@link FunctionReference} for the mutation.
   * @param args  An arguments object for the mutation. If this is omitted,
   *   the arguments will be `{}`.
   * @returns A `Promise` of the mutation's result.
   */
  mutation: <Mutation extends FunctionReference<"mutation", any>>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;

  /**
   * Call a public or internal action.
   *
   * @param action A {@link FunctionReference} for the action.
   * @param args  An arguments object for the action. If this is omitted,
   *   the arguments will be `{}`.
   * @returns A `Promise` of the action's result.
   */
  action: <Action extends FunctionReference<"action", any>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Promise<FunctionReturnType<Action>>;

  /**
   * Read from and write to the mock backend.
   *
   * @param func The async function that reads or writes to the mock backend.
   *   It receives a {@link GenericMutationCtx} as its first argument, enriched
   *   with the `storage` API available in actions, so it can read and write
   *   directly to file storage.
   * @returns A `Promise` of the function's result.
   */
  run: <Output>(
    func: (
      ctx: GenericMutationCtx<DataModel> & { storage: StorageActionWriter },
    ) => Promise<Output>,
  ) => Promise<Output>;

  /**
   * Call an HTTP action.
   *
   * @param path The request URL's path and optional query and fragment.
   * @param init Standard `fetch` options.
   */
  fetch(pathQueryFragment: string, init?: RequestInit): Promise<Response>;

  /**
   * Wait for all scheduled functions currently in the "inProgress" state
   * to either finish successfully or fail.
   *
   * Use in combination with `vi.useFakeTimers()` and `vi.runAllTimers()`
   * to control precisely the execution of scheduled functions.
   *
   * Typically:
   * 1. Use `vi.runAllTimers()` or similar to advance
   *   time such that a function is scheduled.
   * 2. Use `finishInProgressScheduledFunctions()` to wait for the function
   */
  finishInProgressScheduledFunctions: () => Promise<void>;

  /**
   * Wait for all currently scheduled functions and any functions they
   * schedule to either finish successfully or fail.
   *
   * Use in combination with `vi.useFakeTimers()` to test scheduled functions.
   *
   * @param advanceTimers Function that advances timers,
   *   usually `vi.runAllTimers`. This function will be called in a loop
   *   with `finishInProgressScheduledFunctions()`.
   */
  finishAllScheduledFunctions: (advanceTimers: () => void) => Promise<void>;
};

export type TestConvexForDataModelAndIdentity<
  DataModel extends GenericDataModel,
> = {
  /**
   * To test functions which depend on the current authenticated user identity
   * you can create a version of the `t` accessor with given user identity
   * attributes.
   * @param identity A subset of {@link UserIdentity} attributes. If you
   *   don't provide `issuer`, `subject` or `tokenIdentifier` they are
   *   generated automatically.
   */
  withIdentity(
    identity: Partial<UserIdentity>,
  ): TestConvexForDataModel<DataModel>;
} & TestConvexForDataModel<DataModel>;

function getDb() {
  return (global as any).Convex.db as DatabaseFake;
}

function getSyscalls() {
  return (global as any).Convex as {
    syscall: ReturnType<typeof syscallImpl>;
    asyncSyscall: ReturnType<typeof asyncSyscallImpl>;
  };
}

function getModuleCache() {
  return (global as any).Convex.modules as ReturnType<typeof moduleCache>;
}

function moduleCache(specifiedModules?: Record<string, () => Promise<any>>) {
  const modules = specifiedModules ?? import.meta.glob("./convex/**/*.*s");
  const prefix = findModulesRoot(
    Object.keys(modules),
    specifiedModules !== undefined,
  );
  const modulesWithoutExtension = Object.fromEntries(
    Object.entries(modules).map(([path, module]) => [
      path.replace(/\.[^.]+$/, ""),
      module,
    ]),
  );
  return async (path: string) => {
    const module = modulesWithoutExtension[prefix + path];
    if (module === undefined) {
      throw new Error(`Could not find module for: "${path}"`);
    }
    return await module();
  };
}

function findModulesRoot(modulesPaths: string[], userProvidedModules: boolean) {
  const generatedFilePath = modulesPaths.find((path) =>
    path.includes("_generated"),
  );
  if (generatedFilePath !== undefined) {
    return generatedFilePath.split("_generated", 2)[0];
  }

  throw new Error(
    'Could not find the "_generated" directory, make sure to run ' +
      "`npx convex dev` or `npx convex codegen`. " +
      (userProvidedModules
        ? "Make sure your `import.meta.glob` includes the files in the " +
          '"_generated" directory'
        : "If your Convex functions aren't defined in a directory " +
          'called "convex" sibling to your node_modules, ' +
          "provide the second argument to `convexTest`"),
  );
}

/**
 * Call this function at the start of each of your tests.
 *
 * @param schema The default export from your "schema.ts" file.
 * @param modules If you have a custom `functions` path
 *   in convex.json, provide the module map with your functions
 *   by calling `import.meta.glob` with the appropriate glob pattern
 *   for paths relative to the file where you call it.
 * @returns an object which is by convention stored in the `t` variable
 *   and which provides methods for exercising your Convex functions.
 */
export const convexTest = <Schema extends GenericSchema>(
  schema?: SchemaDefinition<Schema, boolean>,
  // For example `import.meta.glob("./**/*.*s")`
  modules?: Record<string, () => Promise<any>>,
): TestConvex<SchemaDefinition<Schema, boolean>> => {
  const db = new DatabaseFake(schema ?? null);
  (global as unknown as { Convex: any }).Convex = {
    syscall: syscallImpl(db),
    asyncSyscall: asyncSyscallImpl(db),
    jsSyscall: jsSyscallImpl(db),
    db,
    modules: moduleCache(modules),
  };

  return {
    withIdentity(identity: Partial<UserIdentity>) {
      const subject =
        identity.subject ?? "" + simpleHash(JSON.stringify(identity));
      const issuer = identity.issuer ?? "https://convex.test";
      const tokenIdentifier =
        identity.tokenIdentifier ?? `${issuer}|${subject}`;
      return withAuth(
        new AuthFake({ ...identity, subject, issuer, tokenIdentifier }),
      );
    },
    ...withAuth(),
  } as any;
};

function withAuth(auth: AuthFake = new AuthFake()) {
  const runTransaction = async <T>(
    handler: (ctx: any, args: any) => T,
    args: any,
    extraCtx: any = {},
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
      const func = await getFunctionFromReference(functionReference, "query");
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
      const func = await getFunctionFromReference(
        functionReference,
        "mutation",
      );
      validateValidator(JSON.parse(func.exportArgs()), args ?? {});
      return await runTransaction(func, args);
    },

    action: async (functionReference: any, args: any) => {
      const func = await getFunctionFromReference(functionReference, "action");
      validateValidator(JSON.parse(func.exportArgs()), args ?? {});

      const a = actionGeneric({
        handler: (ctx: any, a: any) => {
          const testCtx = {
            ...ctx,
            runQuery: byType.query,
            runMutation: byType.mutation,
            runAction: byType.action,
            auth,
          };
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
        JSON.stringify(convexToJson([parseArgs(args)])),
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
      const func = await getFunctionFromReference(functionReference, "any");
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

    fetch: async (path: string, init?: RequestInit) => {
      const router: HttpRouter = (await getModuleCache()("http"))["default"];
      if (!path.startsWith("/")) {
        throw new Error(`Path given to \`t.fetch\` must start with a \`/\``);
      }
      const url = new URL(`https://some.convex.site${path}`);
      const found = router.lookup(url.pathname, init?.method ?? ("GET" as any));
      if (!found) {
        return new Response(`No HttpAction routed for ${url.pathname}`, {
          status: 404,
        });
      }
      const [func] = found;
      const a = httpActionGeneric((ctx: any, a: any) => {
        const testCtx = {
          ...ctx,
          runQuery: byType.query,
          runMutation: byType.mutation,
          runAction: byType.action,
          auth,
        };
        // TODO: Remove `any`, it's needed because of a bug in Convex types
        return func(testCtx, a) as any;
      });
      const response = await (
        a as unknown as {
          invokeHttpAction: (request: Request) => Promise<Response>;
        }
      ).invokeHttpAction(new Request(url, init));
      return response;
    },

    // This is needed because when we execute functions
    // we are performing dynamic `import`s, and those
    // are real work that cannot be force-awaited.
    finishInProgressScheduledFunctions: async (): Promise<void> => {
      await waitForInProgressScheduledFunctions();
    },

    finishAllScheduledFunctions: async (
      advanceTimers: () => void,
    ): Promise<void> => {
      let hadScheduledFunctions;
      do {
        advanceTimers();
        hadScheduledFunctions = await waitForInProgressScheduledFunctions();
      } while (hadScheduledFunctions);
    },
  };
}

function parseArgs(
  args: Record<string, Value> | undefined,
): Record<string, Value> {
  if (args === undefined) {
    return {};
  }
  if (!isSimpleObject(args)) {
    throw new Error(
      `The arguments to a Convex function must be an object. Received: ${
        args as any
      }`,
    );
  }
  return args;
}

async function getFunctionFromReference(
  functionReference: FunctionReference<any, any, any, any>,
  type: "query" | "mutation" | "action" | "any",
) {
  return await getFunctionFromName(getFunctionName(functionReference), type);
}

async function getFunctionFromName(
  functionName: string,
  type: "query" | "mutation" | "action" | "any",
) {
  // api.foo.bar.default -> `foo/bar`
  const [modulePath, maybeExportName] = functionName.split(":");
  const exportName =
    maybeExportName === undefined ? "default" : maybeExportName;

  const module = await getModuleCache()(modulePath);

  const func = module[exportName];
  if (func === undefined) {
    throw new Error(
      `Expected a Convex function exported from module "${modulePath}" as \`${exportName}\`, but there is no such export.`,
    );
  }
  if (typeof func !== "function") {
    throw new Error(
      `Expected a Convex function exported from module "${modulePath}" as \`${exportName}\`, but got: ${func}`,
    );
  }
  switch (type) {
    case "query":
      if (!func.isQuery) {
        throw new Error(
          `Expected a query function, but the function exported from module "${modulePath}" as \`${exportName}\` is not a query.`,
        );
      }
      break;
    case "mutation":
      if (!func.isMutation) {
        throw new Error(
          `Expected a mutation function, but the function exported from module "${modulePath}" as \`${exportName}\` is not a mutation.`,
        );
      }
      break;
    case "action":
      if (!func.isAction) {
        throw new Error(
          `Expected an action function, but the function exported from module "${modulePath}" as \`${exportName}\` is not an action.`,
        );
      }
      break;
    case "any":
      break;
    default:
      throw type satisfies never;
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
