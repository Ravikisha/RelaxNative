module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["import"],
  extends: ["eslint:recommended", "prettier"],
  rules: {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "import/order": [
      "error",
      {
        "alphabetize": { "order": "asc" },
        "newlines-between": "always"
      }
    ]
  }
};
