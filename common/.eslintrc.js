module.exports = {
  plugins: ['lodash'],
  extends: ['eslint:recommended'],
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
      },
    },
  ],
  rules: {
    'no-extra-semi': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'lodash/import-scope': [2, 'member'],
  },
}
