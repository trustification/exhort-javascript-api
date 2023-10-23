import {execSync} from "node:child_process";
import fs from "node:fs";
import path from 'node:path';
import {EOL} from "os";


/** @typedef {{name: string, version: string, dependencies: DependencyEntry[]}} DependencyEntry */



export default class Python_controller {

	pythonEnvDir
	pathToPipBin
	pathToPythonBin
	realEnvironment
	pathToRequirements

	/**
	 * Constructor to create new python controller instance to interact with pip package manager
	 * @param {boolean} realEnvironment - whether to use real environment supplied by client or to create virtual environment
	 * @param {string} pathToPip - path to pip package manager
	 * @param {string} pathToPython - path to python binary
	 * @param {string} pathToRequirements
	 * @
	 */
	constructor(realEnvironment,pathToPip,pathToPython,pathToRequirements) {
		this.pathToPythonBin = pathToPython
		this.pathToPipBin = pathToPip
		this.realEnvironment= realEnvironment
		this.prepareEnvironment()
		this.pathToRequirements = pathToRequirements
	}
	prepareEnvironment()
	{
		if(!this.realEnvironment) {
			this.pythonEnvDir = path.join(path.sep,"tmp","exhort_env_js")
			execSync(`${this.pathToPythonBin} -m venv ${this.pythonEnvDir} `, err => {
				if (err) {
					throw new Error('failed creating virtual python environment - ' + err.message)
				}
			})
			if(this.pathToPythonBin.includes("python3"))
			{
				this.pathToPipBin = path.join(this.pythonEnvDir,"bin","pip3");
				this.pathToPythonBin = path.join(this.pythonEnvDir,"bin","python3")
			}
			else {
				this.pathToPipBin = path.join(this.pythonEnvDir,"bin","pip");
				this.pathToPythonBin = path.join(this.pythonEnvDir,"bin","python")
			}
			// upgrade pip version to latest
			execSync(`${this.pathToPythonBin} -m pip install --upgrade pip `, err => {
				if (err) {
					throw new Error('failed upgrading pip version on virtual python environment - ' + err.message)
				}
			})
		}
		else{
			if(this.pathToPythonBin.startsWith("python")) {
				this.pythonEnvDir = process.cwd()
			}
			else
			{
				this.pythonEnvDir = path.dirname(this.pathToPythonBin)
			}
		}
	}

	/**
	 *
	 * @param {boolean} includeTransitive - whether to return include in returned object transitive dependencies or not
	 * @return {[DependencyEntry]}
	 */
	getDependencies(includeTransitive)
	{
		let startingTime
		let endingTime
		if (process.env["EXHORT_DEBUG"] === "true") {
			startingTime = new Date()
			console.log("Starting time to get requirements.txt dependency tree = " + startingTime)
		}
		if(!this.realEnvironment) {
			execSync(`${this.pathToPipBin} install -r ${this.pathToRequirements}`, err =>{
				if (err) {
					throw new Error('fail installing requirements.txt manifest in created virtual python environment --> ' + err.message)
				}
			})
		}
		let dependencies = this.#getDependenciesImpl(includeTransitive)
		this.#cleanEnvironment()
		if (process.env["EXHORT_DEBUG"] === "true") {
			endingTime = new Date()
			console.log("Ending time to get requirements.txt dependency tree = " + endingTime)
			let time = ( endingTime - startingTime ) / 1000
			console.log("total time to get requirements.txt dependency tree = " + time)
		}
		return dependencies
	}
	/**
	 * @private
	 */
	#cleanEnvironment()
	{
		if(!this.realEnvironment)
		{
			execSync(`${this.pathToPipBin} uninstall -y -r ${this.pathToRequirements}`, err =>{
				if (err) {
					throw new Error('fail uninstalling requirements.txt in created virtual python environment --> ' + err.message)
				}
			})
		}
	}
	#getDependenciesImpl(includeTransitive) {
		let dependencies = new Array()
		let freezeOutput = execSync(`${this.pathToPipBin} freeze`, err =>{
			if (err) {
				throw new Error('fail invoking pip freeze to fetch all installed dependencies in environment --> ' + err.message)
			}
		}).toString();
		let lines = freezeOutput.split(EOL)
		let depNames = lines.map( line => getDependencyName(line)).join(" ")
		let pipShowOutput = execSync(`${this.pathToPipBin} show ${depNames}`, err =>{
			if (err) {
				throw new Error('fail invoking pip show to fetch all installed dependencies metadata --> ' + err.message)
			}
		}).toString();
		let allPipShowDeps = pipShowOutput.split("---");
		let linesOfRequirements = fs.readFileSync(this.pathToRequirements).toString().split(EOL).filter( (line) => !line.startsWith("#")).map(line => line.trim())
		let CachedEnvironmentDeps = {}
		allPipShowDeps.forEach( (record) => {
			let dependencyName = getDependencyNameShow(record).toLowerCase()
			CachedEnvironmentDeps[dependencyName] = record
			CachedEnvironmentDeps[dependencyName.replace("-","_")] = record
			CachedEnvironmentDeps[dependencyName.replace("_","-")] = record
		})
		linesOfRequirements.forEach( (dep) => {
			bringAllDependencies(dependencies,getDependencyName(dep),CachedEnvironmentDeps,includeTransitive)
		})
		dependencies.sort((dep1,dep2) =>{
			const DEP1 = dep1.name.toLowerCase()
			const DEP2 = dep2.name.toLowerCase()
			if(DEP1 < DEP2) {
				return -1;
			}
			if(DEP1 > DEP2)
			{
				return 1;
			}
			return 0;})
		return dependencies
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
	const regex = /[^\w\s-_]/g;
	let endIndex = depLine.search(regex);
	return depLine.substring(0,endIndex) ;
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
 */
function bringAllDependencies(dependencies, dependencyName, cachedEnvironmentDeps, includeTransitive) {
	if(dependencyName === null || dependencyName === undefined || dependencyName.trim() === "" ) {
		return
	}
	let record = cachedEnvironmentDeps[dependencyName.toLowerCase()]
	if(record === null || record  === undefined) {
		throw new Error(`Package name=>${dependencyName} is not installed on your python environment,
		                         either install it ( better to install requirements.txt altogether) or turn on
		                         environment variable EXHORT_PYTHON_VIRTUAL_ENV=true to automatically installs
		                          it on virtual environment ( will slow down the analysis) `)
	}

	let version = getDependencyVersion(record)
	let directDeps = getDepsList(record)
	let targetDeps = new Array()

	let entry = { "name" : getDependencyNameShow(record) , "version" : version, "dependencies" : [] }
	dependencies.push(entry)
	directDeps.forEach( (dep) => {
		if(includeTransitive) {
			bringAllDependencies(targetDeps,dep,cachedEnvironmentDeps,includeTransitive)
		}
		// sort ra
		targetDeps.sort((dep1,dep2) =>{
			const DEP1 = dep1.name.toLowerCase()
			const DEP2 = dep2.name.toLowerCase()
			if(DEP1 < DEP2) {
				return -1;
			}
			if(DEP1 > DEP2)
			{
				return 1;
			}
			return 0;})

		entry["dependencies"] = targetDeps
	})
}

/**
 *
 * @param includeTransitive
 * @return {[DependencyEntry]}
 */

