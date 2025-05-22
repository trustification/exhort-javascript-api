import fs from 'node:fs'
import path from 'node:path'
import { EOL } from 'os'

import TOML from 'fast-toml'

import Sbom from '../sbom.js'

import Base_java, { ecosystem_gradle } from "./base_java.js";



/** @typedef {import('../provider.js').Provider} */

/** @typedef {import('../provider.js').Provided} Provided */

const ROOT_PROJECT_KEY_NAME = "root-project";


const EXHORT_IGNORE_REGEX_LINE = /.*\s?exhortignore\s*$/g
const EXHORT_IGNORE_REGEX = /\/\/\s?exhortignore/

/**
 * Check if the dependency marked for exclusion has libs notation , so if it's true the rest of coordinates( GAV) should be fetched from TOML file.
 * @param {string} depToBeIgnored
 * @return {boolean} returns if the dependency type has library notation or not
 */
function depHasLibsNotation(depToBeIgnored) {
	const regex = new RegExp(":", "g");
	return (depToBeIgnored.trim().startsWith("library(") || depToBeIgnored.trim().includes("libs."))
		&& (depToBeIgnored.match(regex) || []).length <= 1
}

function stripString(depPart) {
	return depPart.replaceAll(/["']/g,"")
}

/** this function checks whether a line from `gradle dependencies` output contains a version or not
 *
 * @param line the line from `gradle dependencies` output.
 * @return {*|boolean}
 */
function containsVersion(line) {
	let lineStriped = line.replace("(n)","").trim()
	return (lineStriped.match(/\W*[a-z0-9.-]+:[a-z0-9.-]+:[0-9]+[.][0-9]+(.[0-9]+)?(.*)?.*/)
		|| lineStriped.match(/.*version:\s?(')?[0-9]+[.][0-9]+(.[0-9]+)?(')?/)) && !lineStriped.includes("libs.")
}

/** this function gets an array {@link arrayForSbom} containing direct deps from build.gradle, and checks for each direct dependency , if there is more than one version for that package,
 * that is, if there exists two different artifacts with the same group (namespace) + name ( artifact), but with different version.
 * if so, it checks to see which one of the versions is the correct one ( determined by result of gradle dependencies command in {@link theContent}) , and then it
 * just remove the other version.
 * @param {string[]} arrayForSbom an array containing the direct dependencies from build.gradle
 * @param {string} theContent multiline string that contains the output of gradle dependencies command.
 */
function removeDuplicateIfExists(arrayForSbom,theContent) {
	return dependency => {
		let content = theContent
		/** @typedef {PackageUrl}
		 */
		let depUrl = this.parseDep(dependency)
		let depVersion
		if(depUrl.version) {
			depVersion = depUrl.version.trim()
		}
		let indexOfDuplicate = arrayForSbom.map(dep => this.parseDep(dep))
			.findIndex(dep => dep.namespace === depUrl.namespace && dep.name === depUrl.name && dep.version !== depVersion)
		let selfIndex = arrayForSbom.map(dep => this.parseDep(dep))
			.findIndex(dep => dep.namespace === depUrl.namespace && dep.name === depUrl.name && dep.version === depVersion)
		if (selfIndex && selfIndex!== indexOfDuplicate && indexOfDuplicate > -1) {
			let duplicateDepVersion = this.parseDep(arrayForSbom[indexOfDuplicate])
			// content.match(/.*1.2.16\W?->\W?1.2.17.*/)
			let regex = new RegExp(`.*${depVersion}\\W?->\\W?${duplicateDepVersion.version}.*`)
			if(content.match(regex)) {
				arrayForSbom.splice(selfIndex, 1)
			}
			else {
				let regex2 = new RegExp(`.*${duplicateDepVersion.version}\\W?->\\W?${depVersion}.*`)
				if(content.match(regex2)) {
					arrayForSbom.splice(indexOfDuplicate, 1)
				}
			}
		}
	};
}

const componentAnalysisConfigs = ["api", "implementation", "compileOnly","compileOnlyApi","runtimeOnly"];
const stackAnalysisConfigs = ["runtimeClasspath","compileClasspath"];

/**
 * This class provides common functionality for Groovy and Kotlin DSL files.
 */
export default class Java_gradle extends Base_java {
	constructor() {
		super('gradle', 'gradlew' + (process.platform === 'win32' ? '.bat' : ''))
	}

	_getManifestName() {
		throw new Error('implement getManifestName method')
	}

	_parseAliasForLibsNotation() {
		throw new Error('implement parseAliasForLibsNotation method')
	}

	_extractDepToBeIgnored() {
		throw new Error('implement extractDepToBeIgnored method')
	}

	/**
	 * @param {string} manifestName - the subject manifest name-type
	 * @returns {boolean} - return true if the manifest name-type is the supported type (example build.gradle)
	 */

	isSupported(manifestName) {
		return this._getManifestName() === manifestName
	}

	/**
	 * @param {string} manifestDir - the directory where the manifest lies
 	 */
	validateLockFile() { return true; }

	/**
	 * Provide content and content type for stack analysis.
	 * @param {string} manifest - the manifest path or name
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {Provided}
	 */


	provideStack(manifest, opts = {}) {
		return {
			ecosystem: ecosystem_gradle,
			content: this.#createSbomStackAnalysis(manifest, opts),
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
			ecosystem: ecosystem_gradle,
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
		let content = this.#getDependencies(manifest, opts)
		let properties = this.#extractProperties(manifest, opts)
		// read dependency tree from temp file
		if (process.env["EXHORT_DEBUG"] === "true") {
			console.log("Dependency tree that will be used as input for creating the BOM =>" + EOL + EOL + content)
		}
		let sbom = this.#buildSbomFileFromTextFormat(content, properties, stackAnalysisConfigs, manifest,opts)
		return sbom
	}

	/**
	 *
	 * @param {string} manifestPath - path to build.gradle.
	 * @param {Object} opts - contains various options settings from client.
	 * @return {{Object}} an object that contains all gradle properties
	 */
	#extractProperties(manifestPath, opts) {
		let properties = {}
		let propertiesContent = this.#getProperties(manifestPath, opts)
		let regExpMatchArray = propertiesContent.match(/([^:]+):\s+(.+)/g);
		for (let i = 0; i < regExpMatchArray.length - 1; i++) {
			let parts = regExpMatchArray[i].split(":");
			properties[parts[0].trim()] = parts[1].trim()
		}
		let regExpMatchArray1 = propertiesContent.match(/Root project '(.+)'/);
		if (regExpMatchArray1[0]) {
			properties[ROOT_PROJECT_KEY_NAME] = regExpMatchArray1[0]
		}
		return properties;
	}

	/**
	 *
	 * @param manifestPath - path to build.gradle
	 * @param {Object} opts - contains various options settings from client.
	 * @return {string} string content of the properties
	 */
	#getProperties(manifestPath, opts) {
		let gradle = this.selectToolBinary(manifestPath, opts)
		try {
			let properties = this._invokeCommand(gradle, ['properties'], {cwd: path.dirname(manifestPath)})
			return properties.toString()
		} catch (error) {
			throw new Error(`Couldn't get properties of ${this._getManifestName()} file , Error message returned from gradle binary => ${EOL} ${error.message}`)
		}
	}

	/**
	 * Create a dependency list for a manifest content.
	 * @param {{}} [opts={}] - optional various options to pass along the application
	 * @returns {string} - sbom string of the direct dependencies of build.gradle
	 * @private
	 */
	#getSbomForComponentAnalysis(manifestPath, opts = {}) {
		let content = this.#getDependencies(manifestPath, opts)
		let properties = this.#extractProperties(manifestPath, opts)
		let configurationNames = componentAnalysisConfigs

		// let configName
		// for (let config of configurationNames) {
		// 	let directDeps = this.#extractLines(content, config);
		// 	if (directDeps.length > 0) {
		// 		configName = config
		// 		break
		//
		// 	}
		// }

		let sbom = this.#buildSbomFileFromTextFormat(content, properties, configurationNames, manifestPath, opts)
		return sbom

	}

	/**
	 * Get a list of dependencies from gradle dependencies command.
	 * @param {string} manifest - path for build.gradle
	 * @returns {string} Multi-line string contain all dependencies from gradle dependencies command
	 * @private
	 */

	#getDependencies(manifest, opts={}) {
		const gradle = this.selectToolBinary(manifest, opts)
		try {
			const commandResult = this._invokeCommand(gradle, ['dependencies'], {cwd: path.dirname(manifest)})
			return commandResult.toString()
		} catch (error) {
			throw new Error(`Couldn't run gradle dependencies command, error message returned from gradle binary => ${EOL} ${error.message}`)
		}
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

	/**
	 *
	 * @param content {string} - content of the dependency tree received from gradle dependencies command
	 * @param properties {Object} - properties of the gradle project.
	 * @param configNames {string[]} - the configuration name of dependencies to include in sbom.
	 * @return {string} return sbom json string of the build.gradle manifest file
	 */
	#buildSbomFileFromTextFormat(content, properties, configNames, manifestPath, opts = {}) {
		let sbom = new Sbom();
		let root = `${properties.group}:${properties[ROOT_PROJECT_KEY_NAME].match(/Root project '(.+)'/)[1]}:jar:${properties.version}`
		let rootPurl = this.parseDep(root)
		sbom.addRoot(rootPurl)
		let lines = new Array()
		// component analysis.
		if (configNames !== stackAnalysisConfigs ) {
			configNames.forEach(configName => {
				let deps = this.#extractLines(content, configName)
				lines = lines.concat(deps)
			})
			let arrayForSbom = this.#prepareLinesForParsingDependencyTree(lines);
			if(arrayForSbom.length > 0 && !containsVersion(arrayForSbom[0])) {
				arrayForSbom = arrayForSbom.slice(1)
			}
			arrayForSbom.forEach( removeDuplicateIfExists.call(this, arrayForSbom,content))
			this.parseDependencyTree(root + ":compile", 0, arrayForSbom, sbom)
		}
		// stack analysis , takes both runtimeClasspath and compileClasspath dependencies
		else {
			configNames.forEach(configName => {
				let lines = this.#extractLines(content, configName)
				let arrayForSbom = this.#prepareLinesForParsingDependencyTree(lines);
				if(arrayForSbom.length > 0 && !containsVersion(arrayForSbom[0])) {
					arrayForSbom = arrayForSbom.slice(1)
				}
				this.parseDependencyTree(root + ":compile", 0, arrayForSbom, sbom)
			})
		}
		// transform gradle dependency tree to the form of maven dependency tree to use common sbom build algorithm in Base_java parent */
		let ignoredDeps = this.#getIgnoredDeps(manifestPath)
		return sbom.filterIgnoredDepsIncludingVersion(ignoredDeps).getAsJsonString(opts);
	}

	#prepareLinesForParsingDependencyTree(lines) {
		return lines.filter(dep => dep.trim() !== "").map(dependency => dependency.replaceAll("---", "-").replaceAll("    ", "  "))
			.map(dependency => dependency.replaceAll(/:(.*):(.*) -> (.*)$/g, ":$1:$3"))
			.map(dependency => dependency.replaceAll(/:(.*)\W*->\W*(.*)$/g, ":$1:$2"))
			.map(dependency => dependency.replaceAll(/(.*):(.*):(.*)$/g, "$1:$2:jar:$3"))
			.map(dependency => dependency.replaceAll(/(n)$/g), "")
			.map(dependency => `${dependency}:compile`);
	}

	/**
	 *
	 * @param {string}dependencies - gradle dependencies
	 * @param startMarker - the start marker configuration for dependencies collection
	 * @return {string[]} - An array of lines that match the parameter startMarker
	 * @private
	 */

	#extractLines(dependencies, startMarker) {
		let dependenciesList = dependencies.split(EOL);
		let resultList = new Array()
		let startFound = false
		for (const dependency in dependenciesList) {
			if (dependenciesList[dependency].startsWith(startMarker)) {
				startFound = true
			}

			if (startFound && dependency.trim() !== "") {
				if(startMarker === 'runtimeClasspath'  || startMarker === 'compileClasspath' || containsVersion(dependenciesList[dependency]) ) {
					resultList.push(dependenciesList[dependency])
				}
			}

			if (startFound && dependenciesList[dependency].trim() === "") {
				break
			}

		}
		return resultList
	}

	/**
	 * This method gets build.gradle manifest, and extracts from it all artifacts marks for exclusion using an //exhortignore comment.
	 * @param {string} manifestPath the build.gradle manifest path
	 * @return {string[]} an array with all dependencies to ignore - contains 'stringified' purls as elements
	 * @private
	 */
	#getIgnoredDeps(manifestPath) {
		let buildGradleLines = fs.readFileSync(manifestPath).toString().split(EOL)
		let ignored =
			buildGradleLines.filter(line => line && line.match(EXHORT_IGNORE_REGEX_LINE))
				.map(line => line.indexOf("/*") === -1 ? line : line.substring(0, line.indexOf("/*")))
				.map(line => line.trim().substring(0, line.trim().search(EXHORT_IGNORE_REGEX)))

		let depsToIgnore = new Array
		ignored.forEach(depToBeIgnored => {
			let ignoredDepInfo
			if (depHasLibsNotation(depToBeIgnored)) {
				ignoredDepInfo = this.#getDepFromLibsNotation(depToBeIgnored, manifestPath);
			} else {
				ignoredDepInfo = this.#getDependencyFromStringOrMapNotation(depToBeIgnored)
			}
			if (ignoredDepInfo) {
				depsToIgnore.push(ignoredDepInfo)
			}
		})
		return depsToIgnore
	}

	#getDepFromLibsNotation(depToBeIgnored, manifestPath) {
		// Extract everything after "libs."
		let alias = depToBeIgnored.substring(depToBeIgnored.indexOf("libs.") + "libs.".length).trim()
		alias = this._parseAliasForLibsNotation(alias)
		// Read and parse the TOML file
		let pathOfToml = path.join(path.dirname(manifestPath),"gradle","libs.versions.toml");
		const tomlString = fs.readFileSync(pathOfToml).toString()
		let tomlObject = TOML.parse(tomlString)
		let groupPlusArtifactObject = tomlObject.libraries[alias]
		let parts = groupPlusArtifactObject.module.split(":");
		let groupId = parts[0]
		let artifactId = parts[1]
		let versionRef = groupPlusArtifactObject.version.ref
		let version = tomlObject.versions[versionRef]
		return groupId && artifactId && version ? this.toPurl(groupId,artifactId,version).toString() : undefined

	}

	/**
	 * Gets a dependency line of type string/map notation from build.gradle, extract the coordinates from it and returns string purl
	 * @param depToBeIgnored
	 * @return {string|undefined} string of a purl format of the extracted coordinates.
	 */
	#getDependencyFromStringOrMapNotation(depToBeIgnored) {
		// dependency line is of form MapNotation
		if (depToBeIgnored.includes("group:") && depToBeIgnored.includes("name:") && depToBeIgnored.includes("version:")) {
			let matchedKeyValues = depToBeIgnored.match(/(group|name|version):\s*['"](.*?)['"]/g)
			let coordinates = {}
			for (let coordinatePairIndex in matchedKeyValues) {
				let keyValue = matchedKeyValues[coordinatePairIndex].split(":");
				coordinates[keyValue[0].trim()] = stripString(keyValue[1].trim())
			}
			return this.toPurl(coordinates.group,coordinates.name,coordinates.version).toString()

		// 	Dependency line is of form String Notation
		} else {
			let depParts
			const depToBeIgnoredMatch = this._extractDepToBeIgnored(depToBeIgnored)
			if(depToBeIgnoredMatch) {
				depParts = depToBeIgnoredMatch.split(":");
			} else {
				depParts = depToBeIgnored.split(":");
			}
			if(depParts.length === 3) {
				let groupId = stripString(depParts[0])
				let artifactId = stripString(depParts[1])
				let version = stripString(depParts[2])
				return this.toPurl(groupId,artifactId,version).toString()
			}

		}

		return undefined
	}
}
