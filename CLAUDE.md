# CLAUDE.md

## Overview

`convex-test` is a community-maintained mock implementation of the Convex backend in TypeScript for automated testing of Convex functions. It simulates the Convex runtime environment to enable unit testing without needing a real Convex backend.

## Common Development Commands

- `npm run build` # includes lint & test
- `npm run lint`
- `npm run format`
- `npx vitest`

## /convex development

- `npx convex dev --once`
  - Run codegen, upload functions to real backend
- `npx convex run file:fn '{...JSON args}'`
  - Run convex functions in the real backend, e.g. to validate behavior
