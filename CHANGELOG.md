# Changelog

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
