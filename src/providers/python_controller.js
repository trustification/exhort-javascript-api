import fs from "node:fs"
import path from 'node:path'
import os, { EOL } from "os"
import { environmentVariableIsPopulated, getCustom, invokeCommand } from "../tools.js"

/** @typedef {{name: string, version: string, dependencies: DependencyEntry[]}} DependencyEntry */

export default class Python_controller {
	pathToPipBin
	pathToPythonBin
	realEnvironment
	pathToRequirements
	options

	/**
	 * Constructor to create new python controller instance to interact with pip package manager
	 * @param {boolean} realEnvironment - whether to use real environment supplied by client or to create virtual environment
	 * @param {string} pathToPip - path to pip package manager
	 * @param {string} pathToPython - path to python binary
	 * @param {string} pathToRequirements
	 * @
	 */
	constructor(realEnvironment, pathToPip, pathToPython, pathToRequirements, options={}) {
		this.pathToPythonBin = pathToPython
		this.pathToPipBin = pathToPip
		this.realEnvironment= realEnvironment
		this.prepareEnvironment()
		this.pathToRequirements = pathToRequirements
		this.options = options
	}

	prepareEnvironment() {
		if(!this.realEnvironment) {
			const pythonEnvDir = path.join(path.sep, "tmp", "exhort_env_js")
			invokeCommand(this.pathToPythonBin, ['-m', 'venv', pythonEnvDir], error => {
				throw new Error(`failed creating virtual python environment: ${error.message}`)
			})

			if(this.pathToPythonBin.includes("python3")) {
				this.pathToPipBin = path.join(path.sep, pythonEnvDir, os.platform() === 'win32' ? "Scripts" : "bin", this.#decideIfWindowsOrLinuxPath("pip3"))
				this.pathToPythonBin = path.join(path.sep, pythonEnvDir, os.platform() === 'win32' ? "Scripts" : "bin", this.#decideIfWindowsOrLinuxPath("python3"))
				if(os.platform() === 'win32') {
					let driveLetter = path.parse(process.cwd()).root
					this.pathToPythonBin = `${driveLetter}${this.pathToPythonBin.substring(1)}`
					this.pathToPipBin = `${driveLetter}${this.pathToPipBin.substring(1)}`
				}
			} else {
				this.pathToPipBin = path.join(path.sep, pythonEnvDir, os.platform() === 'win32' ? "Scripts" : "bin", this.#decideIfWindowsOrLinuxPath("pip"))
				this.pathToPythonBin = path.join(path.sep, pythonEnvDir, os.platform() === 'win32' ? "Scripts" : "bin", this.#decideIfWindowsOrLinuxPath("python"))
				if(os.platform() === 'win32') {
					let driveLetter = path.parse(process.cwd()).root
					this.pathToPythonBin = `${driveLetter}${this.pathToPythonBin.substring(1)}`
					this.pathToPipBin = `${driveLetter}${this.pathToPipBin.substring(1)}`
				}
			}
			// upgrade pip version to latest
			invokeCommand(this.pathToPythonBin, ['-m', 'pip', 'install', '--upgrade', 'pip'], error => {
				throw new Error(`failed upgrading pip version on virtual python environment: ${error.message}`)
			})
		}
	}

	#decideIfWindowsOrLinuxPath(fileName) {
		if (os.platform() === "win32") {
			return fileName + ".exe"
		} else {
			return fileName
		}
	}
	/**
	 *
	 * @param {boolean} includeTransitive - whether to return include in returned object transitive dependencies or not
	 * @return {[DependencyEntry]}
	 */
	getDependencies(includeTransitive) {
		if (process.env["EXHORT_DEBUG"] === "true") {
			var startingTime = new Date()
			console.log("Starting time to get requirements.txt dependency tree = " + startingTime)
		}
		if(!this.realEnvironment) {
			let installBestEfforts = getCustom("EXHORT_PYTHON_INSTALL_BEST_EFFORTS","false",this.options)
			if(installBestEfforts === "false") {
				invokeCommand(this.pathToPipBin, ['install', '-r', this.pathToRequirements], error => {
					throw new Error(`failed installing requirements.txt manifest in created virtual python environment: ${error.message}`)
				})
			}
			// make best efforts to install the requirements.txt on the virtual environment created from the python3 passed in.
			// that means that it will install the packages without referring to the versions, but will let pip choose the version
			// tailored for version of the python environment( and of pip package manager) for each package.
			else {
				let matchManifestVersions = getCustom("MATCH_MANIFEST_VERSIONS","true",this.options)
				if(matchManifestVersions === "true") {
					throw new Error("Conflicting settings, EXHORT_PYTHON_INSTALL_BEST_EFFORTS=true can only work with MATCH_MANIFEST_VERSIONS=false")
				}
				this.#installingRequirementsOneByOne()
			}
		}
		let dependencies = this.#getDependenciesImpl(includeTransitive)
		this.#cleanEnvironment()
		if (process.env["EXHORT_DEBUG"] === "true") {
			const endingTime = new Date()
			console.log("Ending time to get requirements.txt dependency tree = " + endingTime)
			const time = ( endingTime - startingTime ) / 1000
			console.log("total time to get requirements.txt dependency tree = " + time)
		}
		return dependencies
	}

	#installingRequirementsOneByOne() {
		let requirementsContent = fs.readFileSync(this.pathToRequirements)
		let requirementsRows = requirementsContent.toString().split(EOL)
		requirementsRows.filter((line) => !line.trim().startsWith("#")).filter((line) => line.trim() !== "").forEach( (dependency) => {
			let dependencyName = getDependencyName(dependency)
			invokeCommand(this.pathToPipBin, ['install', dependencyName], error => {
				throw new Error(`Best efforts process - failed installing ${dependencyName} in created virtual python environment: ${error.message}`)
			})
		})
	}

	/**
	 * @private
	 */
	#cleanEnvironment() {
		if(!this.realEnvironment) {
			invokeCommand(this.pathToPipBin, ['uninstall', '-y', '-r', this.pathToRequirements], error => {
				throw new Error(`fail uninstalling requirements.txt in created virtual python environment: ${error.message}`)
			})
		}
	}

	#getDependenciesImpl(includeTransitive) {
		let dependencies = new Array()
		let usePipDepTree = getCustom("EXHORT_PIP_USE_DEP_TREE","false",this.options)
		let depNames
		let allPipShowDeps
		let pipDepTreeJsonArrayOutput
		if(usePipDepTree !== "true") {
			const freezeOutput = this.getPipFreezeOutput()
			const lines = freezeOutput.split(EOL)
			depNames = lines.map(line => getDependencyName(line)).join(" ")
		} else {
			pipDepTreeJsonArrayOutput = getDependencyTreeJsonFromPipDepTree(this.pathToPipBin,this.pathToPythonBin)
		}


		if(usePipDepTree !== "true") {
			const pipShowOutput = this.getPipShowOutput(depNames)
			allPipShowDeps = pipShowOutput.split(EOL + "---" + EOL)
		}
		//debug
		// pipShowOutput = "alternative pip show output goes here for debugging"

		let matchManifestVersions = getCustom("MATCH_MANIFEST_VERSIONS","true",this.options)
		let linesOfRequirements = fs.readFileSync(this.pathToRequirements).toString().split(EOL).filter(line => !line.startsWith("#")).map(line => line.trim())
		let CachedEnvironmentDeps = {}
		if(usePipDepTree !== "true") {
			allPipShowDeps.forEach((record) => {
				let dependencyName = getDependencyNameShow(record).toLowerCase()
				CachedEnvironmentDeps[dependencyName] = record
				CachedEnvironmentDeps[dependencyName.replace("-", "_")] = record
				CachedEnvironmentDeps[dependencyName.replace("_", "-")] = record
			})
		} else {
			pipDepTreeJsonArrayOutput.forEach( depTreeEntry => {
				let packageName = depTreeEntry["package"]["package_name"].toLowerCase()
				let pipDepTreeEntryForCache = {
					name: packageName,
					version: depTreeEntry["package"]["installed_version"],
					dependencies: depTreeEntry["dependencies"].map(dep => dep["package_name"])
				}
				CachedEnvironmentDeps[packageName] = pipDepTreeEntryForCache
				CachedEnvironmentDeps[packageName.replace("-", "_")] = pipDepTreeEntryForCache
				CachedEnvironmentDeps[packageName.replace("_", "-")] = pipDepTreeEntryForCache
			})
		}
		linesOfRequirements.forEach(dep => {
			// if matchManifestVersions setting is turned on , then
			if(matchManifestVersions === "true") {
				if(dep.includes("==")) {
					const doubleEqualSignPosition = dep.indexOf("==")
					let manifestVersion = dep.substring(doubleEqualSignPosition + 2).trim()
					if(manifestVersion.includes("#")) {
						let hashCharIndex = manifestVersion.indexOf("#")
						manifestVersion = manifestVersion.substring(0,hashCharIndex)
					}
					const dependencyName = getDependencyName(dep)
					let installedVersion
					// only compare between declared version in manifest to installed version , if the package is installed.
					if(CachedEnvironmentDeps[dependencyName.toLowerCase()] !== undefined) {
						if(usePipDepTree !== "true") {
							installedVersion = getDependencyVersion(CachedEnvironmentDeps[dependencyName.toLowerCase()])
						} else {
							installedVersion = CachedEnvironmentDeps[dependencyName.toLowerCase()].version
						}
					}
					if(installedVersion) {
						if (manifestVersion.trim() !== installedVersion.trim()) {
							throw new Error(`Can't continue with analysis - versions mismatch for dependency name ${dependencyName}, manifest version=${manifestVersion}, installed Version=${installedVersion}, if you want to allow version mismatch for analysis between installed and requested packages, set environment variable/setting - MATCH_MANIFEST_VERSIONS=false`)
						}
					}
				}
			}
			let path = new Array()
			let depName = getDependencyName(dep)
			//array to track a path for each branch in the dependency tree
			path.push(depName.toLowerCase())
			bringAllDependencies(dependencies, depName, CachedEnvironmentDeps, includeTransitive, path, usePipDepTree)
		})
		dependencies.sort((dep1, dep2) =>{
			const DEP1 = dep1.name.toLowerCase()
			const DEP2 = dep2.name.toLowerCase()
			if(DEP1 < DEP2) {
				return -1
			}
			if(DEP1 > DEP2) {
				return 1
			}
			return 0
		})
		return dependencies
	}

	getPipFreezeOutput() {
		if (environmentVariableIsPopulated("EXHORT_PIP_FREEZE")) {
			return Buffer.from(process.env["EXHORT_PIP_FREEZE"], 'base64').toString('ascii')
		} else {
			return invokeCommand(this.pathToPipBin, ['freeze', '--all'], error => {
				throw new Error(`fail invoking pip freeze to fetch all installed dependencies in environment: ${error.message}`)
			}).toString()
		}
	}

	getPipShowOutput(depNames) {
		if(environmentVariableIsPopulated("EXHORT_PIP_SHOW")) {
			return Buffer.from(process.env["EXHORT_PIP_SHOW"], 'base64').toString('ascii')
		} else {
			return invokeCommand(this.pathToPipBin, ['show', depNames], error => {
				throw new Error(`fail invoking pip show to fetch all installed dependencies metadata: ${error.message}`)
			}).toString()
		}
	}
}

/**
 *
 * @param {string} record - a record block from pip show
 * @return {string} the name of the dependency of the pip show record.
 */
function getDependencyNameShow(record) {
	let versionKeyIndex = record.indexOf("Name:")
	let versionToken = record.substring(versionKeyIndex + 5)
	let endOfLine = versionToken.indexOf(EOL)
	return versionToken.substring(0,endOfLine).trim()
}

/**
 *
 * @param {string} record - a record block from pip show
 * @return {string} the name of the dependency of the pip show record.
 */
function getDependencyVersion(record) {
	let versionKeyIndex = record.indexOf("Version:")
	let versionToken = record.substring(versionKeyIndex + 8)
	let endOfLine = versionToken.indexOf(EOL)
	return versionToken.substring(0,endOfLine).trim()
}

/**
 *
 * @param depLine the dependency with version/ version requirement as shown in requirements.txt
 * @return {string} the name of dependency
 */
function getDependencyName(depLine) {
	const regex = /[^\w\s-_.]/g
	let endIndex = depLine.search(regex)
	let result =  depLine.substring(0,endIndex)
	// In case package in requirements text only contain package name without version
	if(result.trim() === "") {
		const regex = /[\w\s-_.]+/g
		if(depLine.match(regex)) {
			result = depLine.match(regex)[0]
		} else {
			result = depLine
		}
	}
	return result.trim()
}

/**
 *
 * @param record - a dependency record block from pip show
 * @return {[string]} array of all direct deps names of that dependency
 */
function getDepsList(record) {
	let requiresKeyIndex = record.indexOf("Requires:")
	let requiresToken = record.substring(requiresKeyIndex + 9)
	let endOfLine = requiresToken.indexOf(EOL)
	let listOfDepsString = requiresToken.substring(0,endOfLine)
	let list = listOfDepsString.split(",").filter(line => line.trim() !== "").map(line => line.trim())
	return list
}

/**
 *
 * @param {[DependencyEntry]} dependencies
 * @param dependencyName
 * @param cachedEnvironmentDeps
 * @param includeTransitive
 * @param usePipDepTree
 * @param {[string]}path array representing the path of the current branch in dependency tree, starting with a root dependency - that is - a given dependency in requirements.txt
 */
function bringAllDependencies(dependencies, dependencyName, cachedEnvironmentDeps, includeTransitive, path, usePipDepTree) {
	if(dependencyName === null || dependencyName === undefined || dependencyName.trim() === "" ) {
		return
	}
	let record = cachedEnvironmentDeps[dependencyName.toLowerCase()]
	if(record === null || record  === undefined) {
		throw new Error(`Package name=>${dependencyName} is not installed in your python environment,
		                         either install it (better to install requirements.txt altogether) or set
		                         the setting EXHORT_PYTHON_VIRTUAL_ENV to true to automatically install
		                         it in virtual environment (please note that this may slow down the analysis)`)
	}
	let depName
	let version
	let directDeps
	if(usePipDepTree !== "true") {
		depName = getDependencyNameShow(record)
		version = getDependencyVersion(record)
		directDeps = getDepsList(record)
	} else {
		depName = record.name
		version = record.version
		directDeps = record.dependencies
	}
	let targetDeps = new Array()

	let entry = {"name": depName, "version": version, "dependencies": []}
	dependencies.push(entry)
	directDeps.forEach(dep => {
		let depArray = new Array()
		// to avoid infinite loop, check if the dependency not already on current path, before going recursively resolving its dependencies.
		if(!path.includes(dep.toLowerCase())) {
			// send to recurrsion the path + the current dep
			depArray.push(dep.toLowerCase())
			if (includeTransitive) {
				// send to recurrsion the array of all deps in path + the current dependency name which is not on the path.
				bringAllDependencies(targetDeps, dep, cachedEnvironmentDeps, includeTransitive, path.concat(depArray), usePipDepTree)
			}
		}
		// sort ra
		targetDeps.sort((dep1,dep2) =>{
			const DEP1 = dep1.name.toLowerCase()
			const DEP2 = dep2.name.toLowerCase()
			if(DEP1 < DEP2) {
				return -1
			}
			if(DEP1 > DEP2) {
				return 1
			}
			return 0
		})

		entry["dependencies"] = targetDeps
	})
}

/**
 * This function install tiny pipdeptree tool using pip ( if it's not already installed on python environment), and use it to fetch the dependency tree in json format.
 * @param {string} pipPath - the filesystem path location of pip binary
 * @param {string} pythonPath - the filesystem path location of python binary
 * @return {Object[]} json array containing objects with the packages and their dependencies from pipdeptree utility
 * @private
 */
function getDependencyTreeJsonFromPipDepTree(pipPath, pythonPath) {
	let dependencyTree
	invokeCommand(pipPath, ['install', 'pipdeptree'], error => {
		throw new Error(`Couldn't install pipdeptree utility, reason: ${error.message}`)
	})

	const cb = (error) => { throw new Error(`couldn't produce dependency tree using pipdeptree tool, stop analysis, message -> ${error.message}`) }
	if(pythonPath.startsWith("python")) {
		dependencyTree = invokeCommand('pipdeptree', ['--json'], cb).toString()
	} else {
		dependencyTree = invokeCommand('pipdeptree', ['--json', '--python', pythonPath], cb).toString()
	}

	return JSON.parse(dependencyTree)
}
