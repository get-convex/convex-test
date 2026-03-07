# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
`convex-test` is a community-maintained mock implementation of the Convex backend in TypeScript for automated testing of Convex functions. It simulates the Convex runtime environment to enable unit testing without needing a real Convex backend.

## Common Development Commands

### Building
- `npm run build` - Lint, test, and compile TypeScript to dist/
- `npm run clean` - Remove dist directory

### Testing
- `npm test` - Run tests in watch mode with Vitest
- `npm run test:once` - Run tests once
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:debug` - Run tests with debugger support
- Run a single test file: `npm test -- convex/queries.test.ts`
- Run tests matching a pattern: `npm test -- --grep "withIndex"`

### Code Quality
- `npm run lint` - Run ESLint and Prettier checks
- `npm run format` - Auto-format code with Prettier

### Convex Development
- `npx convex dev --once` - Push code changes to Convex and update generated files
- `npx convex run file:fn '{...args}'` - Run Convex functions directly to validate test behavior matches real Convex behavior (args in JSON format)

## Architecture

### Core Components

The library consists of a main entry point (`index.ts`) that exports:
- `convexTest()` - Main factory function that creates a test harness
- `TestConvex` - TypeScript type for the test harness with schema
- `TestConvexForDataModel` - Type for test harness with data model

### Key Implementation Details

1. **Mock Database (`DatabaseFake`)**: Simulates Convex database operations including queries, mutations, indexes, and vector search. Maintains in-memory document storage with proper ordering and filtering.

2. **Mock Authentication (`AuthFake`)**: Handles user identity simulation for testing authenticated functions.

3. **Transaction Management (`TransactionManager`)**: Tracks bandwidth usage, document operations, and transaction limits to match Convex runtime constraints.

4. **Function Execution**: The test harness executes Convex functions (queries, mutations, actions) in a simulated environment that mimics the real Convex runtime, including:
   - System fields (_id, _creationTime) auto-generation
   - Schema validation when defined
   - Proper context object construction (ctx.db, ctx.auth, ctx.storage, etc.)
   - Component support for modular testing

5. **HTTP Testing**: Supports testing HTTP actions with simulated request/response handling.

6. **Storage Simulation**: Provides mock file storage for testing storage-related functions.

### Test Structure

Tests are located in `convex/` directory and follow the pattern `*.test.ts`. Each test file typically:
1. Imports `convexTest` from the main module
2. Creates a test harness with optional schema
3. Uses `t.run()` for setup and direct database operations
4. Uses `t.query()`, `t.mutation()`, `t.action()` to test actual Convex functions

### Important Patterns

- The library uses edge-runtime environment for tests (configured in vitest.config.mts)
- Tests often use the `api` object from generated Convex files for type-safe function references
- Mock data follows Convex document structure with system fields
- Bandwidth and transaction limits are tracked to ensure realistic testing

## Testing Considerations

- Always use `await` with database operations as they're asynchronous
- Test both success and error cases, especially for schema validation
- Use `t.withIdentity()` to test authenticated functions
- Component testing requires proper component configuration setup