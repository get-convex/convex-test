import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,

      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },

    extends: compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended-type-checked",
    ),

    rules: {
      // Only warn on unused variables, and ignore variables starting with `_`
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],

      // Allow escaping the compiler
      "@typescript-eslint/ban-ts-comment": "error",

      // Allow explicit `any`s
      "@typescript-eslint/no-explicit-any": "off",

      // START: Allow implicit `any`s
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // END: Allow implicit `any`s

      // Allow async functions without await
      // for consistency (esp. Convex `handler`s)
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // `installGlobalProxies` (see `PATCHABLE_GLOBALS` in `index.ts`) replaces
    // these globals with accessors backed by AsyncLocalStorage, so reading one
    // by its bare name can return a value that a test or a handler installed.
    // Capture the global at module load instead (`realSetTimeout`, `realBtoa`,
    // …). Where the framework genuinely has to read the live value — the clock,
    // which fake timers replace after this module loads — give it one named
    // accessor (`nowMs`, `frameworkSetTimeout`) so `globalThis` appears at the
    // declaration and the call sites stay readable.
    files: ["index.ts", "transactionMetrics.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...[
          "crypto",
          "atob",
          "btoa",
          "structuredClone",
          "fetch",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "Date",
          "console",
        ].map((name) => ({
          name,
          message:
            `\`${name}\` is proxied per handler. Capture it at module load, or ` +
            `read it through a named accessor that documents why it has to be live.`,
        })),
      ],

      // `Math` as a whole isn't restricted: `Math.floor` and friends are only
      // at risk from a handler that replaces the whole object, and prefixing
      // every one of them costs more than it saves. `Math.random` is different:
      // it consumes a handler's mocked sequence, so the framework must never
      // call it.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "`Math.random` consumes a handler's mocked randomness. Use a " +
            "counter for fake identifiers, or capture randomness at module load.",
        },
      ],
    },
  },
  globalIgnores([
    ".context/**",
    "**/.eslintrc.cjs",
    "**/_generated/**",
    "**/dist",
    "**/scripts",
    "**/*.config.mts",
    "eslint.config.mjs",
  ]),
]);
