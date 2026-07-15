import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "audit/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": [
        "error",
        {
          property: "innerHTML",
          message: "XSS防止のため textContent か DOM API を使うこと",
        },
        {
          property: "outerHTML",
          message: "XSS防止のため textContent か DOM API を使うこと",
        },
        {
          object: "document",
          property: "write",
          message: "document.write は禁止",
        },
        {
          object: "localStorage",
          message: "位置情報等の保存防止のため localStorage は使用しない",
        },
        {
          object: "sessionStorage",
          message: "sessionStorage は使用しない",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "localStorage は使用しない" },
        { name: "sessionStorage", message: "sessionStorage は使用しない" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
