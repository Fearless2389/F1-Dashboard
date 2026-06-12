// ESLint flat config — gates the small set of rules that React Doctor was
// catching. The goal is to fail CI before any of these can re-enter the
// codebase, not to be a comprehensive style enforcer.
//
// Rules at "error" level (CI fails):
//   - react-hooks/rules-of-hooks       — hook called conditionally / after return
//   - react/button-has-type            — <button> defaults to submit
//   - react/no-unstable-nested-components — component defined inside another
//
// Rules at "warn" level (visible locally, not CI-blocking):
//   - react-hooks/exhaustive-deps      — useEffect dep array completeness
//   - jsx-a11y rules                   — common accessibility hits
//
// Everything else is intentionally left off — TypeScript handles type
// safety, prettier handles formatting (if we add it later). This is a
// surgical gate, not a style war.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "scripts/**",
      "src/lib/types.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // ── Hard CI gates (error) ──────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",
      "react/button-has-type": "error",
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }],

      // ── Local-only nudges (warn) ───────────────────────────────────
      "react-hooks/exhaustive-deps": "warn",
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",

      // ── Disabled noise ─────────────────────────────────────────────
      // React 17+ JSX transform makes React import unnecessary.
      "react/react-in-jsx-scope": "off",
      // Vite handles JSX runtime detection; this rule fires false positives.
      "react/jsx-uses-react": "off",
      // TypeScript already catches this.
      "react/prop-types": "off",
      // Tailwind/ad-hoc utility-first styling triggers a lot of these.
      "react/no-unknown-property": "off",
      // We use ?? and ?. heavily; this rule fires on legitimate optional
      // chains and the type system already catches the real cases.
      "@typescript-eslint/no-explicit-any": "off",
      // We have intentional unused vars (e.g. _unused destructure for
      // readability). Disable in favour of TypeScript's noUnusedLocals.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      // Empty try/catch blocks are sometimes used for graceful
      // localStorage / clipboard / etc. degradation.
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  // Test files — relax a couple of rules that fight vitest patterns.
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
