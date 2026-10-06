import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({
	enableTypescript: true,
	typescriptRules: {
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-base-to-string': 'off',
		'@typescript-eslint/no-unused-expressions': 'off',
	},
})

export default [
	...config,
	{
		ignores: ['**/*.js', '**/*.js.map'],
	},
	{
		files: ['**/*.js', '**/*.ts'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
