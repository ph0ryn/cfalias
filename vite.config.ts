import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/cli.ts"],
    format: "esm",
    platform: "node",
    target: "node22",
    dts: false,
    clean: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  fmt: {
    arrowParens: "always",
    bracketSpacing: true,
    endOfLine: "lf",
    ignorePatterns: ["pnpm-lock.yaml"],
    insertFinalNewline: true,
    printWidth: 100,
    semi: true,
    singleQuote: false,
    sortImports: {
      groups: [
        ["value-builtin"],
        ["value-external"],
        ["value-internal"],
        ["value-parent", "value-sibling", "value-index"],
        ["type-import"],
        ["unknown"],
      ],
      newlinesBetween: true,
      order: "asc",
    },
    sortPackageJson: true,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
  lint: {
    categories: {
      correctness: "error",
      nursery: "warn",
      pedantic: "off",
      restriction: "off",
      style: "error",
      suspicious: "off",
    },
    env: {
      node: true,
    },
    ignorePatterns: ["dist/**", "node_modules/**"],
    jsPlugins: [
      {
        name: "@stylistic",
        specifier: "@stylistic/eslint-plugin",
      },
    ],
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "capitalized-comments": "off",
      "func-style": "off",
      "id-length": "off",
      "max-statements": "off",
      "no-inferrable-types": "off",
      "no-magic-numbers": "off",
      "no-ternary": "off",
      "one-var": ["error", "never"],
      "prefer-destructuring": "off",
      "sort-imports": "off",
      "@stylistic/no-multiple-empty-lines": [
        "error",
        {
          max: 1,
          maxEOF: 0,
        },
      ],
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "*",
          next: ["return", "multiline-expression", "block-like", "try", "throw"],
        },
        {
          blankLine: "always",
          prev: ["multiline-expression", "block-like", "const", "let"],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["const", "let"],
          next: ["const", "let"],
        },
      ],
    },
    overrides: [
      {
        files: ["src/**/*.ts"],
        rules: {
          "id-match": [
            "error",
            "^_*([^_]+|[A-Z][A-Z0-9_]*)_*$",
            {
              onlyDeclarations: true,
              properties: false,
            },
          ],
        },
      },
      {
        files: ["vite.config.ts"],
        rules: {
          "sort-keys": "off",
        },
      },
    ],
  },
  staged: {
    "*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}": "vp check --fix",
    "*.{json,jsonc,yaml,yml,md,mdx,html,css,scss}": "vp fmt",
  },
});
