
import {execSync} from "node:child_process";
import fs from 'node:fs'
import {
	environmentVariableIsPopulated,
	getCustom,
	getCustomPath,
	handleSpacesInPath
} from "../tools.js";
import os from 'node:os'
import path from 'node:path'
import Sbom from '../sbom.js'
import {PackageURL} from 'packageurl-js'
import  {EOL} from 'os'
import Python_controller from './python_controller.js'

export default { isSupported, validateLockFile, provideComponent, provideStack }

const dummyVersionNotation = "dummy*=#?";

/** @typedef {{name: string, version: string, dependencies: DependencyEntry[]}} DependencyEntry */

/**
 * @type {string} ecosystem for python-pip is 'pip'
 * @private
 */
const ecosystem = 'pip'

/**
 * @param {string} manifestName - the subject manifest name-type
 * @returns {boolean} - return true if `requirements.txt` is the manifest name-type
 */
function isSupported(manifestName) {
	return 'requirements.txt' === manifestName
}

/**
 * @param {string} manifestDir - the directory where the manifest lies
 */
function validateLockFile() {}

/**
 * Provide content and content type for python-pip stack analysis.
 * @param {string} manifest - the manifest path or name
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideStack(manifest, opts = {}) {
	return {
		ecosystem,
		content: createSbomStackAnalysis(manifest, opts),
		contentType: 'application/vnd.cyclonedx+json'
	}
}

/**
 * Provide content and content type for python-pip component analysis.
 * @param {string} data - content of requirements.txt for component report
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideComponent(data, opts = {}) {
	return {
		ecosystem,
		content: getSbomForComponentAnalysis(data, opts),
		contentType: 'application/vnd.cyclonedx+json'
	}
}

/** @typedef {{name: string, , version: string, dependencies: DependencyEntry[]}} DependencyEntry */

/**
 *
 * @param {PackageURL}source
 * @param {DependencyEntry} dep
 * @param {Sbom} sbom
 * @private
 */
function addAllDependencies(source, dep, sbom) {
	let targetPurl = toPurl(dep["name"],dep["version"])
	sbom.addDependency(sbom.purlToComponent(source),targetPurl)
	let directDeps = dep["dependencies"]
	if (directDeps !== undefined && directDeps.length > 0) {
		directDeps.forEach( (dependency) =>{ addAllDependencies(toPurl(dep["name"],dep["version"]),dependency,sbom)})
	}


}



/**
 *
 * @param nameVersion
 * @return {string}
 */
function splitToNameVersion(nameVersion)
{
	let result = []
	if(nameVersion.includes("==")) {
		result = nameVersion.split("==")
	}
	else {
		const regex = /[^\w\s-_]/g;
		let endIndex = nameVersion.search(regex);
		result.push(nameVersion.substring(0,endIndex).trim())
		result.push(dummyVersionNotation)
	}

	return `${result[0]};;${result[1]}`
}

/**
 *
 * @param {string} requirementTxtContent
 * @return {PackageURL []}
 */
function getIgnoredDependencies(requirementTxtContent) {
	let requirementsLines = requirementTxtContent.split(EOL)
	return requirementsLines
		.filter(line => line.includes("#exhortignore") || line.includes("# exhortignore"))
		.map((line) => line.substring(0,line.indexOf("#")).trim())
		.map((name) => {
			let strings = splitToNameVersion(name).split(";;");
			return toPurl(strings[0],strings[1])})
}

/**
 *
 * @param {string} requirementTxtContent content of requirments.txt in string
 * @param {Sbom} sbom object to filter out from it exhortignore dependencies.
 * @param {{Object}} opts - various options and settings for the application
 * @private
 */
function handleIgnoredDependencies(requirementTxtContent, sbom,opts ={}) {
	let ignoredDeps = getIgnoredDependencies(requirementTxtContent)
	let ignoredDepsVersion = ignoredDeps
		.filter(dep => !dep.toString().includes(dummyVersionNotation) )
		.map(dep => dep.toString())
	let ignoredDepsNoVersions = ignoredDeps
		.filter(dep => dep.toString().includes(dummyVersionNotation))
		.map(dep => dep.name)
	sbom.filterIgnoredDeps(ignoredDepsNoVersions)
	let matchManifestVersions = getCustom("MATCH_MANIFEST_VERSIONS","true",opts);
	if(matchManifestVersions === "true") {
		sbom.filterIgnoredDepsIncludingVersion(ignoredDepsVersion)
	}
	else
	{
		// in case of version mismatch, need to parse the name of package from the purl, and remove the package name from sbom according to name only
		// without version
		sbom.filterIgnoredDeps(ignoredDepsVersion.map((dep) => dep.split("@")[0].split("pkg:pypi/")[1]))
	}
}

/** get python and pip binaries, python3/pip3 get precedence if exists on the system path
 * @param {object}binaries
 * @param {{}} [opts={}]
 */
function getPythonPipBinaries(binaries,opts) {
	let python = getCustomPath("python3",opts)
	let pip = getCustomPath("pip3",opts)
	try {
		execSync(`${handleSpacesInPath(python)} --version`)
		execSync(`${handleSpacesInPath(pip)} --version`)
	} catch (e) {
		python = getCustomPath("python",opts)
		pip = getCustomPath("pip",opts)
		try {
			execSync(`${handleSpacesInPath(python)} --version`)
			execSync(`${handleSpacesInPath(pip)} --version`)
		} catch (e) {
			throw new Error(`Couldn't get python binaries from supplied environment variables ${e.getMessage}`)
		}
	}
	binaries.pip = pip
	binaries.python = python


}

/**
 *
 * @param binaries
 * @param opts
 * @return {string}
 * @private
 */
function handlePythonEnvironment(binaries, opts) {
	let createVirtualPythonEnv
	if (!environmentVariableIsPopulated("EXHORT_PIP_SHOW") && !environmentVariableIsPopulated("EXHORT_PIP_FREEZE")) {
		getPythonPipBinaries(binaries, opts)
		createVirtualPythonEnv = getCustom("EXHORT_PYTHON_VIRTUAL_ENV", "false", opts);
	}
	// bypass invoking python and pip, as we get all information needed to build the dependency tree from these Environment variables.
	else {
		binaries.pip = "pip"
		binaries.python = "python"
		createVirtualPythonEnv = "false"
	}
	return createVirtualPythonEnv
}

const DEFAULT_PIP_ROOT_COMPONENT_NAME = "default-pip-root";

const DEFAULT_PIP_ROOT_COMPONENT_VERSION = "0.0.0";

/**
 * Create sbom json string out of a manifest path for stack analysis.
 * @param {string} manifest - path for requirements.txt
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {string} the sbom json string content
 * @private
 */
function createSbomStackAnalysis(manifest, opts = {}) {
	let binaries = {}
	let createVirtualPythonEnv = handlePythonEnvironment(binaries, opts);


	let pythonController = new Python_controller(createVirtualPythonEnv === "false",binaries.pip,binaries.python,manifest,opts)
	let dependencies = pythonController.getDependencies(true);
	let sbom = new Sbom();
	sbom.addRoot(toPurl(DEFAULT_PIP_ROOT_COMPONENT_NAME,DEFAULT_PIP_ROOT_COMPONENT_VERSION))
	dependencies.forEach(dep => {
		addAllDependencies(sbom.getRoot(),dep,sbom)
	})
	let requirementTxtContent = fs.readFileSync(manifest).toString();
	handleIgnoredDependencies(requirementTxtContent,sbom,opts)
	// In python there is no root component, then we must remove the dummy root we added, so the sbom json will be accepted by exhort backend
	// sbom.removeRootComponent()
	return sbom.getAsJsonString(opts)


}

/**
 * Create a sbom json string out of a manifest content for component analysis
 * @param {string} data - content of requirements.txt
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {string} the sbom json string content
 * @private
 */
function getSbomForComponentAnalysis(data, opts = {}) {
	let binaries = {}
	let createVirtualPythonEnv = handlePythonEnvironment(binaries, opts);
	let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhort_'))
	let tmpRequirementsPath = path.join(tmpDir, 'requirements.txt')
	fs.writeFileSync(tmpRequirementsPath, data)
	let pythonController = new Python_controller(createVirtualPythonEnv === "false",binaries.pip,binaries.python,tmpRequirementsPath,opts)
	let dependencies = pythonController.getDependencies(false);
	let sbom = new Sbom();
	sbom.addRoot(toPurl(DEFAULT_PIP_ROOT_COMPONENT_NAME,DEFAULT_PIP_ROOT_COMPONENT_VERSION))
	dependencies.forEach(dep => {
		sbom.addDependency(sbom.getRoot(),toPurl(dep.name, dep.version))
	})
	fs.rmSync(tmpDir, { recursive: true, force: true });
	handleIgnoredDependencies(data,sbom,opts)
	// In python there is no root component, then we must remove the dummy root we added, so the sbom json will be accepted by exhort backend
	// sbom.removeRootComponent()
	return sbom.getAsJsonString(opts)
}


/**
 * Returns a PackageUrl For pip dependencies
 * @param name
 * @param version
 * @return {PackageURL}
 */
function toPurl(name,version)
{
	return new PackageURL('pypi',undefined,name,version,undefined,undefined);
}


