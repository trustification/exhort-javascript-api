import { XMLParser } from 'fast-xml-parser'
import fs from 'node:fs'
import { getCustomPath, getGitRootDir, getWrapperPreference } from "../tools.js";
import os from 'node:os'
import path from 'node:path'
import Sbom from '../sbom.js'
import { EOL } from 'os'
import Base_java, { ecosystem_maven } from "./base_java.js";


/** @typedef {import('../provider').Provider} */

/** @typedef {import('../provider').Provided} Provided */

/** @typedef {{name: string, version: string}} Package */

/** @typedef {{groupId: string, artifactId: string, version: string, scope: string, ignore: boolean}} Dependency */

export default class Java_maven extends Base_java {

	/**
	 * @param {string} manifestName - the subject manifest name-type
	 * @returns {boolean} - return true if `pom.xml` is the manifest name-type
	 */

	isSupported(manifestName) {
		return 'pom.xml' === manifestName
	}

	/**
	 * @param {string} manifestDir - the directory where the manifest lies
 	*/
	validateLockFile() { return true; }

	/**
	 * Provide content and content type for maven-maven stack analysis.
	 * @param {string} manifest - the manifest path or name
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {Provided}
	 */


	provideStack(manifest, opts = {}) {
		return {
			ecosystem: ecosystem_maven,
			content: this.#createSbomStackAnalysis(manifest, opts),
			contentType: 'application/vnd.cyclonedx+json'
		}
	}

	/**
	 * Provide content and content type for maven-maven component analysis.
	 * @param {string} manifest - path to the manifest file
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {Provided}
	 */

	provideComponent(manifest, opts = {}) {
		return {
			ecosystem: ecosystem_maven,
			content: this.#getSbomForComponentAnalysis(manifest, opts),
			contentType: 'application/vnd.cyclonedx+json'
		}
	}

	/**
	 * Create a Dot Graph dependency tree for a manifest path.
	 * @param {string} manifest - path for pom.xml
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {string} the Dot Graph content
	 * @private
	 */
	#createSbomStackAnalysis(manifest, opts = {}) {
		const mvn = this.#selectMvnRuntime(manifest, opts)

		// clean maven target
		try {
			this._invokeCommand(mvn, ['-q', 'clean', '-f', manifest])
		} catch (error) {
			throw new Error(`failed to clean maven target`, {cause: error})
		}

		// create dependency graph in a temp file
		let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhort_'))
		let tmpDepTree = path.join(tmpDir, 'mvn_deptree.txt')
		// build initial command (dot outputType is not available for verbose mode)
		let depTreeCmdArgs = ['-q', 'org.apache.maven.plugins:maven-dependency-plugin:3.6.0:tree', '-Dverbose', '-DoutputType=text', `-DoutputFile=${tmpDepTree}`, '-f', manifest]
		// exclude ignored dependencies, exclude format is groupId:artifactId:scope:version.
		// version and scope are marked as '*' if not specified (we do not use scope yet)
		let ignoredDeps = new Array()
		this.#getDependencies(manifest).forEach(dep => {
			if (dep.ignore) {
				depTreeCmdArgs.push(`-Dexcludes=${dep['groupId']}:${dep['artifactId']}:${dep['scope']}:${dep['version']}`)
				ignoredDeps.push(this.toPurl(dep.groupId, dep.artifactId, dep.version).toString())
			}
		})
		// execute dependency tree command
		try {
			this._invokeCommand(mvn, depTreeCmdArgs)
		} catch (error) {
			throw new Error(`failed creating maven dependency tree`, {cause: error})
		}
		// read dependency tree from temp file
		let content = fs.readFileSync(tmpDepTree)
		if (process.env["EXHORT_DEBUG"] === "true") {
			console.error("Dependency tree that will be used as input for creating the BOM =>" + EOL + EOL + content.toString())
		}
		let sbom = this.createSbomFileFromTextFormat(content.toString(), ignoredDeps,opts);
		// delete temp file and directory
		fs.rmSync(tmpDir, {recursive: true, force: true})
		// return dependency graph as string
		return sbom
	}

	/**
	 *
	 * @param {String} textGraphList Text graph String of the manifest
	 * @param {[String]} ignoredDeps List of ignored dependencies to be omitted from sbom
	 * @return {String} formatted sbom Json String with all dependencies
	 */
	createSbomFileFromTextFormat(textGraphList, ignoredDeps, opts) {
		let lines = textGraphList.split(EOL);
		// get root component
		let root = lines[0];
		let rootPurl = this.parseDep(root);
		let sbom = new Sbom();
		sbom.addRoot(rootPurl);
		this.parseDependencyTree(root, 0, lines.slice(1), sbom);
		return sbom.filterIgnoredDepsIncludingVersion(ignoredDeps).getAsJsonString(opts);
	}

	/**
	 * Create a dependency list for a manifest content.
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {[Dependency]} the Dot Graph content
	 * @private
	 */
	#getSbomForComponentAnalysis(manifestPath, opts = {}) {
		const mvn = this.#selectMvnRuntime(manifestPath, opts)

		const tmpEffectivePom = path.resolve(path.join(path.dirname(manifestPath), 'effective-pom.xml'))
		const targetPom = manifestPath

		// create effective pom and save to temp file
		try {
			this._invokeCommand(mvn, ['-q', 'help:effective-pom', `-Doutput=${tmpEffectivePom}`, '-f', targetPom])
		} catch (error) {
			throw new Error(`failed creating maven effective pom`, {cause: error})
		}
		// iterate over all dependencies in original pom and collect all ignored ones
		let ignored = this.#getDependencies(targetPom).filter(d => d.ignore)
		// iterate over all dependencies and create a package for every non-ignored one
		/** @type [Dependency] */
		let dependencies = this.#getDependencies(tmpEffectivePom)
			.filter(d => !(this.#dependencyIn(d, ignored)) && !(this.#dependencyInExcludingVersion(d, ignored)))
		let sbom = new Sbom();
		let rootDependency = this.#getRootFromPom(tmpEffectivePom, targetPom);
		let purlRoot = this.toPurl(rootDependency.groupId, rootDependency.artifactId, rootDependency.version)
		sbom.addRoot(purlRoot)
		let rootComponent = sbom.getRoot();
		dependencies.forEach(dep => {
			let currentPurl = this.toPurl(dep.groupId, dep.artifactId, dep.version)
			sbom.addDependency(rootComponent, currentPurl)
		})
		fs.rmSync(tmpEffectivePom)

		// return dependencies list
		return sbom.getAsJsonString(opts)
	}

	/**
	 *
	 * @param effectivePomManifest effective pom manifest path
	 * @param originalManifest pom.xml manifest path
	 * @return {Dependency} returns the root dependency for the pom
	 * @private
	 */
	#getRootFromPom(effectivePomManifest) {

		let parser = new XMLParser()
		let buf = fs.readFileSync(effectivePomManifest)
		let effectivePomStruct = parser.parse(buf.toString())
		let pomRoot
		if (effectivePomStruct['project']) {
			pomRoot = effectivePomStruct['project']
		} else { // if there is no project root tag, then it's a multi module/submodules aggregator parent POM
			for (let proj of effectivePomStruct['projects']['project']) {
				// need to choose the aggregate POM and not one of the modules.
				if (proj.packaging && proj.packaging === 'pom') {
					pomRoot = proj
				}
			}
		}
		/** @type Dependency */
		let rootDependency = {
			groupId: pomRoot['groupId'],
			artifactId: pomRoot['artifactId'],
			version: pomRoot['version'],
			scope: '*',
			ignore: false
		}
		return rootDependency
	}

	#selectMvnRuntime(manifestPath, opts) {
		// get custom maven path
		let mvn = getCustomPath('mvn', opts)

		// check if mvnw is preferred and available
		let useMvnw = getWrapperPreference('mvn', opts)
		if (useMvnw) {
			const mvnw = this.#traverseForMvnw(manifestPath)
			if (mvnw !== undefined) {
				try {
					this._invokeCommand(mvnw, ['--version'])
				} catch (error) {
					if (error.code === 'ENOENT') {
						useMvnw = false
					} else {
						throw new Error(`failed to check for mvnw`, {cause: error})
					}
				}
				mvn = useMvnw ? mvnw : mvn
			}
		} else {
			// verify maven is accessible
			try {
				this._invokeCommand(mvn, ['--version'])
			} catch (error) {
				if (error.code === 'ENOENT') {
					throw new Error(`maven not accessible at "${mvn}"`)
				} else {
					throw new Error(`failed to check for maven`, {cause: error})
				}
			}
		}
		return mvn
	}

	/**
	 *
	 * @param {string} startingManifest - the path of the manifest from which to start searching for mvnw
	 * @param {string} repoRoot - the root of the repository at which point to stop searching for mvnw, derived via git if unset and then fallsback
	 * to the root of the drive the manifest is on (assumes absolute path is given)
	 * @returns
	 */
	#traverseForMvnw(startingManifest, repoRoot = undefined) {
		repoRoot = repoRoot || getGitRootDir(path.resolve(path.dirname(startingManifest))) || path.parse(path.resolve(startingManifest)).root

		const wrapperName = 'mvnw' + (process.platform === 'win32' ? '.cmd' : '');
		const wrapperPath = path.join(path.resolve(path.dirname(startingManifest)), wrapperName);

		try {
			fs.accessSync(wrapperPath, fs.constants.X_OK)
		} catch(error) {
			if (error.code === 'ENOENT') {
				if (path.resolve(path.dirname(startingManifest)) === repoRoot) {
					return undefined
				}
				return this.#traverseForMvnw(path.resolve(path.dirname(startingManifest)), repoRoot)
			}
			throw new Error(`failure searching for mvnw`, {cause: error})
		}
		return wrapperPath
	}

	/**
	 * Get a list of dependencies with marking of dependencies commented with <!--exhortignore-->.
	 * @param {string} manifest - path for pom.xml
	 * @returns {[Dependency]} an array of dependencies
	 * @private
	 */
	#getDependencies(manifest) {
		/** @type [Dependency] */
		let ignored = []
		// build xml parser with options
		let parser = new XMLParser({
			commentPropName: '#comment', // mark comments with #comment
			isArray: (_, jpath) => 'project.dependencies.dependency' === jpath,
			numberParseOptions: {
				skipLike: /[0-9]+[.]0/
			}
		})
		// read manifest pom.xml file into buffer
		let buf = fs.readFileSync(manifest)
		// parse manifest pom.xml to json
		let pomJson = parser.parse(buf.toString())
		// iterate over all dependencies and chery pick dependencies with a exhortignore comment
		let pomXml;
		// project without modules
		if (pomJson['project']) {
			if (pomJson['project']['dependencies'] !== undefined) {
				pomXml = pomJson['project']['dependencies']['dependency']
			} else {
				pomXml = []
			}
		} else { // project with modules
			pomXml = pomJson['projects']['project'].filter(project => project.dependencies !== undefined).flatMap(project => project.dependencies.dependency)
		}

		pomXml.forEach(dep => {
			let ignore = false
			if (dep['#comment'] && dep['#comment'].includes('exhortignore')) { // #comment is an array or a string
				ignore = true
			}
			if (dep['scope'] !== 'test') {
				ignored.push({
					groupId: dep['groupId'],
					artifactId: dep['artifactId'],
					version: dep['version'] ? dep['version'].toString() : '*',
					scope: '*',
					ignore: ignore
				})
			}
		})
		// return list of dependencies
		return ignored
	}

	/**
	 * Utility function for looking up a dependency in a list of dependencies ignoring the "ignored"
	 * field
	 * @param dep {Dependency} dependency to look for
	 * @param deps {[Dependency]} list of dependencies to look in
	 * @returns boolean true if found dep in deps
	 * @private
	 */
	#dependencyIn(dep, deps) {
		return deps.filter(d => dep.artifactId === d.artifactId && dep.groupId === d.groupId && dep.version === d.version && dep.scope === d.scope).length > 0
	}

	#dependencyInExcludingVersion(dep, deps) {
		return deps.filter(d => dep.artifactId === d.artifactId && dep.groupId === d.groupId && dep.scope === d.scope).length > 0
	}
}
