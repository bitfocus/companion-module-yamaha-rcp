import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({})

export default [
	...config,
	{
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
