import { EOL } from 'os';

import { toPurl, toPurlFromString } from "../../tools.js";
import { ecosystem } from "../base_javascript.js";

import Yarn_processor from "./yarn_processor.js";

/**
 * Processor for Yarn Berry package manager
 * Handles parsing and processing of dependencies for Yarn Berry projects
 */
export default class Yarn_berry_processor extends Yarn_processor {

	static LOCATOR_PATTERN = /^(@?[^@]+(?:\/[^@]+)?)@npm:(.+)$/;
	static VIRTUAL_LOCATOR_PATTERN = /^(@?[^@]+(?:\/[^@]+)?)@virtual:[^#]+#npm:(.+)$/;

	/**
	 * Returns the command arguments for listing dependencies
	 * @param {boolean} includeTransitive - Whether to include transitive dependencies
	 * @returns {string[]} Command arguments for listing dependencies
	 */
	listCmdArgs(includeTransitive) {
		return ['info', includeTransitive ? '--recursive' : '--all', '--json'];
	}

	/**
	 * Returns the command arguments for updating the lock file
	 * @param {string}  - Directory containing the manifest file
	 * @returns {string[]} Command arguments for updating the lock file
	 */
	updateLockFileCmdArgs() {
		return ['install', '--immutable'];
	}

	/**
   * Parses the dependency tree output from Yarn Berry
   * Converts multiple JSON objects into a valid JSON array
   * @param {string} output - The raw command output
   * @returns {string} Properly formatted JSON string
   */
	parseDepTreeOutput(output) {
		// Transform output by removing line breaks and ensuring proper JSON array format
		const outputArray = output.trim().split(EOL).join('').replaceAll('}{', '},{');
		return `[${outputArray}]`;
	}

	/**
   * Extracts root dependencies from the dependency tree
   * @param {Object} depTree - The dependency tree object
   * @returns {Map<string, PackageURL>} Map of dependency names to their PackageURL objects
   */
	getRootDependencies(depTree) {
		if (!depTree) {
			return new Map();
		}

		return new Map(
			depTree.filter(dep => !this.#isRoot(dep.value)).map(
				dep => {
					const depName = dep.value;
					const idx = depName.lastIndexOf('@');
					const name = depName.substring(0, idx);
					const version = dep.children.Version;
					return [name, toPurl(ecosystem, name, version)];
				}
			)
		);
	}

	/**
   * Checks if a dependency is the root package
   * @param {string} name - Name of the dependency
   * @returns {boolean} True if the dependency is the root package
   * @private
   */
	#isRoot(name) {
		if (!name) {
			return false;
		}
		return name.endsWith("@workspace:.");
	}

	/**
   * Adds dependencies to the SBOM
   * @param {Sbom} sbom - The SBOM object to add dependencies to
   * @param {Object} depTree - The dependency tree object
   */
	addDependenciesToSbom(sbom, depTree) {
		if (!depTree) {
			return;
		}

		depTree.forEach(n => {
			const depName = n.value;
			const from = this.#isRoot(depName) ? toPurlFromString(sbom.getRoot().purl) : this.#purlFromNode(depName, n);
			const deps = n.children?.Dependencies;
			if(!deps) {return;}
			deps.forEach(d => {
				const to = this.#purlFromLocator(d.locator);
				if(to) {
					sbom.addDependency(from, to);
				}
			});
		})
	}

	/**
   * Creates a PackageURL from a dependency locator
   * @param {string} locator - The dependency locator
   * @returns {PackageURL|undefined} The PackageURL or undefined if not valid
   * @private
   */
	#purlFromLocator(locator) {
		if (!locator) {
			return undefined;
		}

		const matches = Yarn_berry_processor.LOCATOR_PATTERN.exec(locator);
		if (matches) {
			return toPurl(ecosystem, matches[1], matches[2]);
		}

		const virtualMatches = Yarn_berry_processor.VIRTUAL_LOCATOR_PATTERN.exec(locator);
		if (virtualMatches) {
			return toPurl(ecosystem, virtualMatches[1], virtualMatches[2]);
		}

		return undefined;
	}

	/**
   * Creates a PackageURL from a dependency node
   * @param {string} depName - The dependency name
   * @param {Object} node - The dependency node object
   * @returns {PackageURL|undefined} The PackageURL or undefined if not valid
   * @private
   */
	#purlFromNode(depName, node) {
		if (!node?.children?.Version) {
			return undefined;
		}

		const name = depName.substring(0, depName.lastIndexOf('@'));
		const version = node.children.Version;
		return toPurl(ecosystem, name, version);
	}
}
