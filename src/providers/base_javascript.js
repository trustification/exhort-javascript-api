import fs from 'node:fs'
import os from "node:os";
import path from 'node:path'
import { PackageURL } from 'packageurl-js'

import { getCustomPath, invokeCommand } from "../tools.js";
import Sbom from '../sbom.js'

/** @typedef {import('../provider.js').Provider} */

/** @typedef {import('../provider.js').Provided} Provided */

const ecosystem = 'npm'
const defaultVersion = 'v0.0.0'

export default class Base_javascript {

	// Resolved cmd to use
	#cmd;

	/**
   * @returns {string} the name of the lock file name for the specific implementation
   */
	_lockFileName() {
		throw new TypeError("_lockFileName must be implemented");
	}

	/**
   * @returns {string} the command name to use for the specific JS package manager
   */
	_cmdName() {
		throw new TypeError("_cmdName must be implemented");
	}

	/**
   * @returns {Array<string>}
   */
	_listCmdArgs() {
		throw new TypeError("_listCmdArgs must be implemented");
	}

	/**
   * @returns {Array<string>}
   */
	_updateLockFileCmdArgs() {
		throw new TypeError("_updateLockFileCmdArgs must be implemented");
	}

	/**
   * @param {string} manifestName - the subject manifest name-type
   * @returns {boolean} - return true if `pom.xml` is the manifest name-type
   */
	isSupported(manifestName) {
		return 'package.json' === manifestName;
	}

	/**
   * Checks if a required lock file exists in the same path as the manifest
   *
   * @param {string} manifestDir - The base directory where the manifest is located
   * @returns {boolean} - True if the lock file exists
   */
	validateLockFile(manifestDir) {
		const lock = path.join(manifestDir, this._lockFileName());
		return fs.existsSync(lock);
	}

	/**
   * Provide content and content type for maven-maven stack analysis.
   * @param {string} manifest - the manifest path or name
   * @param {{}} [opts={}] - optional various options to pass along the application
   * @returns {Provided}
   */
	provideStack(manifest, opts = {}) {
		return {
			ecosystem,
			content: this.#getSBOM(manifest, opts, true),
			contentType: 'application/vnd.cyclonedx+json'
		}
	}

	/**
   * Provide content and content type for maven-maven component analysis.
   * @param {string} manifest - path to pom.xml for component report
   * @param {{}} [opts={}] - optional various options to pass along the application
   * @returns {Provided}
   */
	provideComponent(manifest, opts = {}) {
		return {
			ecosystem,
			content: this.#getSBOM(manifest, opts, false),
			contentType: 'application/vnd.cyclonedx+json'
		}
	}

	/**
   * Utility function for creating Purl String
   * @param name the name of the artifact, can include a namespace(group) or not - namespace/artifactName.
   * @param version the version of the artifact
   * @returns {PackageURL|null} PackageUrl Object ready to be used in SBOM
   */
	#toPurl(name, version) {
		let parts = name.split("/");
		var purlNs, purlName;
		if (parts.length === 2) {
			purlNs = parts[0];
			purlName = parts[1];
		} else {
			purlName = parts[0];
		}
		return new PackageURL('npm', purlNs, purlName, version, undefined, undefined);
	}

	_buildDependencyTree(includeTransitive, manifest) {
		this.#version();
		let manifestDir = path.dirname(manifest)
		this.#createLockFile(manifestDir);

		let npmOutput = this.#executeListCmd(includeTransitive, manifestDir);
		return JSON.parse(npmOutput);
	}

	/**
   * Create SBOM json string for npm Package.
   * @param {string} manifest - path for package.json
   * @param {{}} [opts={}] - optional various options to pass along the application
   * @returns {string} the SBOM json content
   * @private
   */
	#getSBOM(manifest, opts = {}, includeTransitive) {
		this.#cmd = getCustomPath(this._cmdName(), opts);
		const depsObject = this._buildDependencyTree(includeTransitive, manifest, opts);
		let rootName = depsObject["name"]
		let rootVersion = depsObject["version"]
		if (!rootVersion) {
			rootVersion = defaultVersion
		}
		let mainComponent = this.#toPurl(rootName, rootVersion);

		let sbom = new Sbom();
		sbom.addRoot(mainComponent)

		let dependencies = depsObject["dependencies"] || {};
		this.#addAllDependencies(sbom, sbom.getRoot(), dependencies)
		let packageJson = fs.readFileSync(manifest).toString()
		let packageJsonObject = JSON.parse(packageJson);
		if (packageJsonObject.exhortignore !== undefined) {
			let ignoredDeps = Array.from(packageJsonObject.exhortignore);
			sbom.filterIgnoredDeps(ignoredDeps)
		}
		return sbom.getAsJsonString(opts)
	}

	/**
   * This function recursively build the Sbom from the JSON that npm listing returns
   * @param sbom this is the sbom object
   * @param from this is the current component in bom (Should start with root/main component of SBOM) for which we want to add all its dependencies.
   * @param dependencies the current dependency list (initially it's the list of the root component)
   * @private
   */
	#addAllDependencies(sbom, from, dependencies) {
		Object.entries(dependencies)
			.filter(entry => entry[1].version !== undefined)
			.forEach(entry => {
				let [name, artifact] = entry;
				let purl = this.#toPurl(name, artifact.version);
				sbom.addDependency(from, purl)
				let transitiveDeps = artifact.dependencies
				if (transitiveDeps !== undefined) {
					this.#addAllDependencies(sbom, sbom.purlToComponent(purl), transitiveDeps)
				}
			});
	}

	#executeListCmd(includeTransitive, manifestDir) {
		const listArgs = this._listCmdArgs(includeTransitive, manifestDir);
		return this.#invokeCommand(listArgs);
	}

	#version() {
		this.#invokeCommand(['--version'], { stdio: 'ignore' });
	}

	#createLockFile(manifestDir) {
		// in windows os, --prefix flag doesn't work, it behaves really weird , instead of installing the package.json fromm the prefix folder,
		// it's installing package.json (placed in current working directory of process) into prefix directory, so
		let originalDir = process.cwd()
		if (os.platform() === 'win32') {
			process.chdir(manifestDir)
		}
		const args = this._updateLockFileCmdArgs(manifestDir);
		try {
			this.#invokeCommand(args);
		} catch (error) {
			throw new Error(`failed to create lockfile "${args}"`, { cause: error });
		} finally {
			if (os.platform() === 'win32') {
				process.chdir(originalDir)
			}
		}
	}

	#invokeCommand(args, opts = {}) {
		try {
			return invokeCommand(this.#cmd, args, opts);
		} catch (error) {
			if (error.code === 'ENOENT') {
				throw new Error(`${this.#cmd} is not accessible`);
			}
			throw new Error(`failed to execute ${this.#cmd} ${args}`, { cause: error })
		}
	}
}

