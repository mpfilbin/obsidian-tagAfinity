import { defineConfig } from 'eslint/config';
import obsidian from 'eslint-plugin-obsidianmd';

export default defineConfig([
  ...obsidian.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.*'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);
