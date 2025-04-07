import { PackageURL } from 'packageurl-js'
import { invokeCommand, invokeCommandGetOutput } from "../tools.js"


/** @typedef {import('../provider').Provider} */

/** @typedef {import('../provider').Provided} Provided */

/** @typedef {{name: string, version: string}} Package */

/** @typedef {{groupId: string, artifactId: string, version: string, scope: string, ignore: boolean}} Dependency */

/**
 * @type {string} ecosystem for java maven packages.
 * @private
 */
export const ecosystem_maven = 'maven'
export const ecosystem_gradle = 'gradle'
export default class Base_Java {
	DEP_REGEX = /(([-a-zA-Z0-9._]{2,})|[0-9])/g
	CONFLICT_REGEX = /.*omitted for conflict with (\S+)\)/

	/**
	 * Recursively populates the SBOM instance with the parsed graph
	 * @param {string} src - Source dependency to start the calculations from
	 * @param {number} srcDepth - Current depth in the graph for the given source
	 * @param {Array} lines - Array containing the text files being parsed
	 * @param {Sbom} sbom - The SBOM where the dependencies are being added
	 */
	parseDependencyTree(src, srcDepth, lines, sbom) {
		if (lines.length === 0) {
			return;
		}
		if ((lines.length === 1 && lines[0].trim() === "")) {
			return;
		}
		let index = 0;
		let target = lines[index];
		let targetDepth = this.#getDepth(target);
		while (targetDepth > srcDepth && index < lines.length) {
			if (targetDepth === srcDepth + 1) {
				let from = this.parseDep(src);
				let to = this.parseDep(target);
				let matchedScope = target.match(/:compile|:provided|:runtime|:test|:system|:import/g)
				let matchedScopeSrc = src.match(/:compile|:provided|:runtime|:test|:system|:import/g)
				// only add dependency to sbom if it's not with test scope or if it's root
				if ((matchedScope && matchedScope[0] !== ":test" && (matchedScopeSrc && matchedScopeSrc[0] !== ":test")) || (srcDepth == 0 && matchedScope && matchedScope[0] !== ":test")) {
					sbom.addDependency(sbom.purlToComponent(from), to)
				}
			} else {
				this.parseDependencyTree(lines[index - 1], this.#getDepth(lines[index - 1]), lines.slice(index), sbom)
			}
			target = lines[++index];
			targetDepth = this.#getDepth(target);
		}
	}

	/**
	 * Calculates how deep in the graph is the given line
	 * @param {string} line - line to calculate the depth from
	 * @returns {number} The calculated depth
	 * @private
	 */
	#getDepth(line) {
		if (line === undefined) {
			return -1;
		}
		return ((line.indexOf('-') - 1) / 3) + 1;
	}

	/**
	 * Create a PackageURL from any line in a Text Graph dependency tree for a manifest path.
	 * @param {string} line - line to parse from a dependencies.txt file
	 * @returns {PackageURL} The parsed packageURL
	 */
	parseDep(line) {

		let match = line.match(this.DEP_REGEX);
		if (!match) {
			throw new Error(`Unable generate SBOM from dependency tree. Line: ${line} cannot be parsed into a PackageURL`);
		}
		let version
		if (match.length >= 5 && ['compile', 'provided', 'runtime'].includes(match[5])) {
			version = `${match[4]}-${match[3]}`
		} else {
			version = match[3]
		}
		let override = line.match(this.CONFLICT_REGEX);
		if (override) {
			version = override[1];
		}
		return this.toPurl(match[0], match[1], version);
	}

	/**
	 * Returns a PackageUrl For Java maven dependencies
	 * @param group
	 * @param artifact
	 * @param version
	 * @return {PackageURL}
	 */
	toPurl(group, artifact, version) {
		if (typeof version === "number") {
			version = version.toString()
		}
		return new PackageURL('maven', group, artifact, version, undefined, undefined);
	}

	/** this method invokes command string in a process in a synchronous way.
	 * @param bin - the command to be invoked
	 * @param args - the args to pass to the binary
	 * @param callback - function to invoke if an error was thrown
	 * @protected
	 */
	_invokeCommand(bin, args, callback) { invokeCommand(bin, args, callback) }

	/** this method invokes command string in a process in a synchronous way.
	 * @param cmdString - the command to be invoked
	 * @param workingDir - the directory in which the command will be invoked
	 * @return the output of the command
	 * @protected
	 */
	_invokeCommandGetOutput(cmdString, workingDir) { return invokeCommandGetOutput(cmdString, workingDir) }
}
