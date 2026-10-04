// @ts-check
import { baseConfig } from "../../eslint.config.js";

export default [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Vite/React apps commonly re-export components alongside hooks/consts.
      "react-refresh/only-export-components": "off",
    },
  },
];
