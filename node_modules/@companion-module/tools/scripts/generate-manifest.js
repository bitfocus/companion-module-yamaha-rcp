#!/usr/bin/env zx

import { fs, path, $ } from 'zx'
import parseAuthor from 'parse-author'

if (await fs.pathExists('companion/manifest.json')) {
	throw new Error('Manifest has already been created')
}

const pkgJsonStr = await fs.readFile('package.json')
const pkgJson = JSON.parse(pkgJsonStr.toString())

const maintainers = []

function tryParsePerson(person) {
	try {
		if (person) {
			const rawAuthor = typeof person === 'string' ? parseAuthor(person) : person
			if (rawAuthor.name) {
				maintainers.push({
					name: rawAuthor.name,
					email: rawAuthor.email,
				})
			}
		}
	} catch (e) {
		// Ignore
	}
}

tryParsePerson(pkgJson.author)
if (Array.isArray(pkgJson.contributors)) {
	for (const person of pkgJson.contributors) {
		tryParsePerson(person)
	}
}

let products = pkgJson.products || pkgJson.product || []
if (typeof products === 'string') products = [products]

const manifest = {
	id: pkgJson.name,
	name: pkgJson.name,
	shortname: pkgJson.shortname ?? pkgJson.name,
	description: pkgJson.description ?? pkgJson.name,
	version: '0.0.0',
	license: pkgJson.license,
	repository: pkgJson.repository?.url ?? `https://github.com/bitfocus/companion-module-${pkgJson.name}.git`,
	bugs: pkgJson.bugs?.url ?? `https://github.com/bitfocus/companion-module-${pkgJson.name}/issues`,
	maintainers: maintainers,
	legacyIds: [...(pkgJson.legacy || [])],

	runtime: {
		type: 'node18',
		api: 'nodejs-ipc',
		apiVersion: '0.0.0',

		entrypoint: path.join('../', pkgJson.main || 'index.js'),
		// universal: boolean
	},

	manufacturer: pkgJson.manufacturer ?? '',
	products: products,
	keywords: pkgJson.keywords || [],
}

const manifestDir = './companion'
await fs.mkdirp(manifestDir)
await fs.writeFile(path.join(manifestDir, 'manifest.json'), JSON.stringify(manifest, undefined, '\t'))

if (await fs.pathExists('HELP.md')) {
	await fs.move('HELP.md', path.join(manifestDir, 'HELP.md'))

	// guess at what images might be needed by the help
	if (await fs.pathExists('images')) await fs.move('images', path.join(manifestDir, 'images'))
	if (await fs.pathExists('documentation')) await fs.move('documentation', path.join(manifestDir, 'documentation'))
}

// for (const folder of dirs) {
// 	if (folder.match(/companion-module-/) && !ignoreNames.includes(folder)) {
// 		const moduleDir = path.join(outerDir, folder)
// 		const moduleNewDir = path.join(outerManifest, folder)
// 		const manifestDir = path.join(moduleNewDir, 'companion')

//
// 		await fs.mkdirp(manifestDir)
// 		await fs.writeFile(path.join(manifestDir, 'manifest.json'), JSON.stringify(manifest, undefined, '\t'))

// 		if (await fs.pathExists(( 'HELP.md'))) {
// 			await fs.copy(( 'HELP.md'), path.join(manifestDir, 'HELP.md'))

// 			// guess at what images might be needed by the help
// 			if (await fs.pathExists(( 'images')))
// 				await fs.copy(( 'images'), path.join(manifestDir, 'images'))
// 			if (await fs.pathExists(( 'documentation')))
// 				await fs.copy(( 'documentation'), path.join(manifestDir, 'documentation'))
// 		}

// 		await fs.writeFile(
// 			path.join(outerEntrypoints, `${pkgJson.name}.cjs`),
// 			`
// global.modulePkg = require('companion-module-${pkgJson.name}/package.json')
// global.moduleFactory = require('companion-module-${pkgJson.name}')
// global.moduleName = "${pkgJson.name}"
// import('../../dist/index.js')
// 			`
// 		)
// 	}
// }

// console.log('Bundling code. This will take a couple of minutes')
// await $`yarn webpack`

// // trick node into treating them all as cjs
// await fs.writeFile(`manifests/package.json`, '')

// // const useDir = await fs.pathExists('./module/legacy')
// // const baseDir = useDir ? './module/legacy' : './node_modules/companion-wrapped-module'
