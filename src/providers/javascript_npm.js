import fs from 'node:fs'
import os from "node:os";
import { getCustomPath, invokeCommand } from "../tools.js";
import path from 'node:path'
import Sbom from '../sbom.js'
import { PackageURL } from 'packageurl-js'

var npmInteractions = {
	listing: function(npm, manifestDir, includeAll) {
		const args = ['ls', '--omit=dev', '--package-lock-only', '--json', '--prefix', manifestDir]
		if (includeAll) {
			args.push('--all')
		}
		return invokeCommand(npm, args, error => {
			throw new  Error('failed to get npmOutput json from npm', {cause: error})
		}).toString()
	},
	version: function(npm) {
		invokeCommand(npm, ['--version'], error => {
			if (error.code === 'ENOENT') {
				throw new Error(`npm is not accessible at ${npm}`, {})
			}
			throw new Error('failed to check for npm', {cause: error})
		})
	},
	createPackageLock: function(npm, manifestDir) {
		// in windows os, --prefix flag doesn't work, it behaves really weird , instead of installing the package.json fromm the prefix folder,
		// it's installing package.json (placed in current working directory of process) into prefix directory, so
		let originalDir = process.cwd()
		if(os.platform() === 'win32') {
			process.chdir(manifestDir)
		}
		invokeCommand(npm, ['i', '--package-lock-only', '--prefix', manifestDir], error => {
			throw new Error('failed to create npmOutput list', {cause: error})
		})
		if(os.platform() === 'win32') {
			process.chdir(originalDir)
		}
	}
}
export default { isSupported, validateLockFile, provideComponent, provideStack }

/** @typedef {import('../provider').Provider} */

/** @typedef {import('../provider').Provided} Provided */

/** @typedef {{name: string, version: string}} Package */

/** @typedef {{groupId: string, artifactId: string, version: string, scope: string, ignore: boolean}} Dependency */

/**
 * @type {string} ecosystem for npm-npm is 'maven'
 * @private
 */
const ecosystem = 'npm'
const defaultVersion = 'v0.0.0'

/**
 * @param {string} manifestName - the subject manifest name-type
 * @returns {boolean} - return true if `pom.xml` is the manifest name-type
 */
function isSupported(manifestName) {
	return 'package.json' === manifestName;
}

/**
 * @param {string} manifestDir - the directory where the manifest lies
 */
function validateLockFile(manifestDir) {
	const lockFileName = ["package-lock.json"].find(expectedLockFileName => {
		const lock = path.join(manifestDir, expectedLockFileName);
		return fs.existsSync(lock);
	});
	if (!lockFileName) {
		throw new Error("Lock file does not exists or is not supported. Execute '<pkg manager> install' to generate it")
	}
}

/**
 * Provide content and content type for maven-maven stack analysis.
 * @param {string} manifest - the manifest path or name
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideStack(manifest, opts = {}) {
	return {
		ecosystem,
		content: getSBOM(manifest, opts, true),
		contentType: 'application/vnd.cyclonedx+json'
	}
}

/**
 * Provide content and content type for maven-maven component analysis.
 * @param {string} manifest - path to pom.xml for component report
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideComponent(manifest, opts = {}) {
	return {
		ecosystem,
		content: getSBOM(manifest, opts, false),
		contentType: 'application/vnd.cyclonedx+json'
	}
}

/**
 * Create SBOM json string for npm Package.
 * @param {string} manifest - path for package.json
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {string} the SBOM json content
 * @private
 */
function getSBOM(manifest, opts = {}, includeTransitive) {
	// get custom npm path
	let npm = getCustomPath('npm', opts)
	// verify npm is accessible
	npmInteractions.version(npm);
	let manifestDir = path.dirname(manifest)
	npmInteractions.createPackageLock(npm, manifestDir);
	let npmOutput = npmInteractions.listing(npm, manifestDir, includeTransitive);
	let depsObject = JSON.parse(npmOutput);
	let rootName = depsObject["name"]
	let rootVersion = depsObject["version"]
	if(!rootVersion) {
		rootVersion = defaultVersion
	}
	let mainComponent = toPurl(rootName,rootVersion);

	let sbom = new Sbom();
	sbom.addRoot(mainComponent)

	let dependencies = depsObject["dependencies"] || {};
	addAllDependencies(sbom,sbom.getRoot(),dependencies)
	let packageJson = fs.readFileSync(manifest).toString()
	let packageJsonObject = JSON.parse(packageJson);
	if(packageJsonObject.exhortignore !== undefined) {
		let ignoredDeps = Array.from(packageJsonObject.exhortignore);
		sbom.filterIgnoredDeps(ignoredDeps)
	}
	return sbom.getAsJsonString(opts)
}

/**
 * Utility function for creating Purl String

 * @param name the name of the artifact, can include a namespace(group) or not - namespace/artifactName.
 * @param version the version of the artifact
 * @private
 * @returns {PackageURL|null} PackageUrl Object ready to be used in SBOM
 */
function toPurl(name, version) {
	let parts = name.split("/");
	if(parts.length === 2) {
		return new PackageURL('npm', parts[0], parts[1], version, undefined, undefined);
	} else {
		return new PackageURL('npm', undefined, parts[0], version, undefined, undefined);
	}
}

/**
 * This function recursively build the Sbom from the JSON that npm listing returns
 * @param sbom this is the sbom object
 * @param from this is the current component in bom (Should start with root/main component of SBOM) for which we want to add all its dependencies.
 * @param dependencies the current dependency list (initially it's the list of the root component)
 * @private
 */
function addAllDependencies(sbom, from, dependencies) {
	Object.entries(dependencies)
		.filter(entry => entry[1].version !== undefined)
		.forEach(entry => {
			let [name, artifact] = entry;
			let purl = toPurl(name, artifact.version);
			sbom.addDependency(from, purl)
			let transitiveDeps = artifact.dependencies
			if(transitiveDeps !== undefined) {
				addAllDependencies(sbom, sbom.purlToComponent(purl), transitiveDeps)
			}
		});
}
