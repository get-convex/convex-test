# Changelog

## 0.0.50

- Correctly deserializes ConvexError thrown within nested functions.
- Fixes a bug where orphaned scheduled functions would eventually fire
  and hit "Cannot read properties of null (reading 'state')".

## 0.0.49

- Changes the test ID formatting to not include a `;` and be the
  standard length of regular IDs for folks who have validators.

## 0.0.48

- Add implementations for internal syscalls for upcoming ctx.meta
  features (ctx.meta.{getFunctionMetadata,getTransactionMetrics})

## 0.0.47

- Fix: Isolate function stack tracking between parallel function calls
  to prevent corruption when calling different components in parallel.
  This may have presented previously as not being able to find modules
  that existed but were being resolved for the wrong component.

## 0.0.46

- Changes `finishAllScheduledFunctions` to pump the macrotask queue instead
  of microtask queue to enable dynamic imports to resolve, which regressed
  in 0.0.45.

## 0.0.45

- Replaces global usage with AsyncLocalStorage-scoped test state for isolation.
  Now tests shouldn't fail due to dirty state left behind by other tests.
- Better support for setTimeout usage within tested functions
- Improves typing for inline calls to t.mutation(() => {}) to be a union
  instead of overload so `TestConvex<SpecificSchema>` is assignable to
  `TestConvex<GenericSchema>`.

## 0.0.44

- More correctly implements nested transactions and parallel calls.
- Starts validating return validators.
- Propagates auth more correctly between callsites-not scheduler or components.

## 0.0.43

- Support pagination when documents may be deleted by using the values as the cursor
  instead of the ID.

## 0.0.42

- Supports running inline functions via `t.action((ctx) => {...})` to aid in testing
  code that expects an action environment. Also works in t.query and t.mutation
- Support for PaginationOptions maximumRowsRead & maximumBytesRead, as well as
  page splitting.
- Supports setting and enforcing transaction read/write limits within tests.
- Fix: Finish actions cleanly when they throw
- Replaces the compareValues implementation with the one now in "convex/values"

## 0.0.41

- Removes ActionCtx support for now. Calling component actions was not working correctly.

## 0.0.40

- Extends ctx in t.run to conform to both MutationCtx and ActionCtx.

## 0.0.39

- Adds support for using the upcoming ctx.db syntax where you pass explicit table names.
- Improves text search implementation to more closely match Convex text search: case insensitive, splitting whitespace and handling undefined in withIn
  ex.

## 0.0.38

- Implements the hidden .count() function.
- Supports unions on args at the top level.

## 0.0.37

- Allow system fields fields in schema. This isn't an intended use case but convex-test should match the runtime behavior of the convex runtime when possible.

## 0.0.36

- Fix a bug around serialization of arguments to scheduled functions.

---

Previous versions are documented in git history.
