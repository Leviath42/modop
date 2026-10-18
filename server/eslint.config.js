import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "db/", "node_modules/"] },
  ...tseslint.configs.recommended,
);
