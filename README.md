# `convex-test`

The `convex-test` library provides a community-maintained mock implementation of
the Convex backend in TypeScript, for use in automated tests of Convex
functions.

Check out the Convex testing docs: https://docs.convex.dev/functions/testing

Assignments to supported runtime globals, including `Math`, `Date`, `console`,
`process`, and `crypto`, are isolated per Convex function invocation. Nested
function calls see their own globals. To hide a global within a handler, assign
`undefined`. Deleting or redefining global properties, or mutating shared objects
in place (such as assigning `Math.random`), bypasses this isolation.

Queries and mutations reject `fetch` and timer functions such as `setTimeout`.
Use an action for those operations; scheduling through `ctx.scheduler` remains
supported.

Migration note: these restrictions also apply to `t.run` and inline `t.mutation`
callbacks, which run in transactions. Tests that previously fetched data or waited
on timers inside these callbacks must move that setup into the test body before
calling `t.run` or `t.mutation`.
