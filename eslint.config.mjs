import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
    {
        ignores: ["dist/**", "node_modules/**", "*.js", "*.mjs", "copy-assets.mjs", "esbuild.config.mjs"]
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            globals: globals.node,
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: __dirname,
            }
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            ...pluginJs.configs.recommended.rules,
            ...tseslint.configs.recommended.rules,
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "no-console": "off",
            "prefer-const": "off"
        }
    }
];