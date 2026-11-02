import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "embeddedAssets.js",
      "version.generated.js",
      "scripts/**",
      "docs/**",
    ],
  },

  // Base JS config
  js.configs.recommended,

  // Some steps use an empty catch block on purpose, for example cleanup and optional reads.
  // Other empty blocks are still errors.
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Frontend (React) config
  {
    files: ["src/frontend/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Set by vite.config.js (define) at build time.
        __APP_VERSION__: "readonly",
        __CH_VERSION__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "19.1.0",
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // Backend (Node/Bun) config
  {
    files: ["src/backend/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
        Bun: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // Shared code
  {
    files: ["src/shared/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },
];