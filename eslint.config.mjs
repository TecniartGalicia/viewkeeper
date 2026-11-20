import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'out/**', 'node_modules/**', '*.mjs', 'scripts/**', 'test/sonda/**'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
    },
  },
  {
    // El agente corre dentro de la página del usuario: ES2017, script clásico, sin dependencias.
    files: ['media/agent.js'],
    languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: { ...globals.browser, __VK_PANEL: 'readonly', __VK_APIS: 'readonly', __VK_TARGETS: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], eqeqeq: ['error', 'smart'], 'no-redeclare': 'error' },
  },
];
