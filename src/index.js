import path from "node:path";
import { EOL } from "os";
import { availableProviders, match } from './provider.js'
import analysis from './analysis.js'
import fs from 'node:fs'
import { getCustom } from "./tools.js";
import.meta.dirname
import * as url from 'url';

export { parseImageRef } from "./oci_image/utils.js";
export { ImageRef } from "./oci_image/images.js";

export default { componentAnalysis, stackAnalysis, imageAnalysis, validateToken }

export const exhortDevDefaultUrl = 'https://exhort.stage.devshift.net';

/** @type {string} The default production URL for the Exhort backend. */
export const exhortDefaultUrl = "https://rhda.rhcloud.com";

/**
 * @typedef {{
 * EXHORT_DOCKER_PATH?: string | undefined,
 * EXHORT_GO_MVS_LOGIC_ENABLED?: string | undefined,
 * EXHORT_GO_PATH?: string | undefined,
 * EXHORT_GRADLE_PATH?: string | undefined,
 * EXHORT_IMAGE_PLATFORM?: string | undefined,
 * EXHORT_MVN_PATH?: string | undefined,
 * EXHORT_PIP_PATH?: string | undefined,
 * EXHORT_PIP_USE_DEP_TREE?: string | undefined,
 * EXHORT_PIP3_PATH?: string | undefined,
 * EXHORT_PNPM_PATH?: string | undefined,
 * EXHORT_PODMAN_PATH?: string | undefined,
 * EXHORT_PREFER_GRADLEW?: string | undefined,
 * EXHORT_PREFER_MVNW?: string | undefined,
 * EXHORT_PROXY_URL?: string | undefined,
 * EXHORT_PYTHON_INSTALL_BEST_EFFORTS?: string | undefined,
 * EXHORT_PYTHON_PATH?: string | undefined,
 * EXHORT_PYTHON_VIRTUAL_ENV?: string | undefined,
 * EXHORT_PYTHON3_PATH?: string | undefined,
 * EXHORT_RECOMMENDATIONS_ENABLED?: string | undefined,
 * EXHORT_SKOPEO_CONFIG_PATH?: string | undefined,
 * EXHORT_SKOPEO_PATH?: string | undefined,
 * EXHORT_SYFT_CONFIG_PATH?: string | undefined,
 * EXHORT_SYFT_PATH?: string | undefined,
 * EXHORT_YARN_PATH?: string | undefined,
 * MATCH_MANIFEST_VERSIONS?: string | undefined,
 * RHDA_SOURCE?: string | undefined,
 * RHDA_TOKEN?: string | undefined,
 * [key: string]: string | undefined,
 * }} Options
 */


/**
 * Logs messages to the console if the EXHORT_DEBUG environment variable is set to "true".
 * @param {string} alongsideText - The text to prepend to the log message.
 * @param {any} valueToBePrinted - The value to log.
 * @private
 */
function logOptionsAndEnvironmentsVariables(alongsideText,valueToBePrinted) {
	if (process.env["EXHORT_DEBUG"] === "true") {
		console.log(`${alongsideText}: ${valueToBePrinted} ${EOL}`)
	}
}

/**
 * Reads the version from the package.json file and logs it if debug mode is enabled.
 * @private
 */
function readAndPrintVersionFromPackageJson() {
	let dirName
// new ESM way in nodeJS ( since node version 22 ) to bring module directory.
	dirName = import.meta.dirname
// old ESM way in nodeJS ( before node versions 22.00 to bring module directory)
	if (!dirName) {
		dirName = url.fileURLToPath(new URL('.', import.meta.url));
	}

	try {
		if (__dirname) {
			dirName = __dirname;
		}
	} catch (e) {
		console.log("__dirname is not defined, continue with fileUrlPath")
	}

	let packageJson = JSON.parse(fs.readFileSync(path.join(dirName, "..", "package.json")).toString())
	logOptionsAndEnvironmentsVariables("exhort-javascript-api analysis started, version: ", packageJson.version)
}

/**
 * This function is used to determine exhort theUrl backend according to the following logic:
 * If EXHORT_DEV_MODE = true, then take the value of the EXHORT BACKEND URL of dev/staging environment in such a way:
 * take it as environment variable if exists, otherwise, take it from opts object if exists, otherwise, use the hardcoded default of DEV environment.
 * If EXHORT_DEV_MODE = false , then select the production theUrl of EXHORT Backend, which is hardcoded.
 * EXHORT_DEV_MODE evaluated in the following order and selected when it finds it first:
 * 1. Environment Variable
 * 2. (key,value) from opts object
 * 3. Default False ( points to production URL )
 * @param {{}} [opts={}] - optional various options to override default EXHORT_DEV_MODE and DEV_EXHORT_BACKEND_URL.
 * @return {string} - The selected exhort backend
 * @private
 */
function selectExhortBackend(opts = {}) {
	let result
	if (process.env["EXHORT_DEBUG"] === "true") {
		let packageJson = readAndPrintVersionFromPackageJson();
	}
	let exhortDevModeBundled = "false"
	let exhortDevMode = getCustom("EXHORT_DEV_MODE", exhortDevModeBundled, opts)
	if(exhortDevMode !== null && exhortDevMode.toString() === "true") {
		result = getCustom('DEV_EXHORT_BACKEND_URL', exhortDevDefaultUrl, opts);
	} else {
		result = exhortDefaultUrl
	}

	logOptionsAndEnvironmentsVariables("Chosen exhort backend URL:", result)

	return result;
}

/**
 * Test function for selecting the Exhort backend URL.
 * Primarily used for testing the backend selection logic.
 * @param {object} [opts={}] - Optional configuration, similar to `selectExhortBackend`.
 * @return {string} The selected exhort backend URL.
 */
export function testSelectExhortBackend(opts) {
	return selectExhortBackend(opts)
}

/**
 * @type {string} The URL of the Exhort backend to send requests to.
 * @private
 */
let theUrl

/**
 * @overload
 * @param {string} manifest
 * @param {true} html
 * @param {Options} [opts={}]
 * @returns {Promise<string>}
 * @throws {Error}
 */

/**
 * @overload
 * @param {string} manifest
 * @param {false} html
 * @param {Options} [opts={}]
 * @returns {Promise<import('@trustification/exhort-api-spec/model/v4/AnalysisReport').AnalysisReport>}
 * @throws {Error}
 */

/**
 * Get stack analysis report for a manifest file.
 * @overload
 * @param {string} manifest - path for the manifest
 * @param {boolean} [html=false] - true will return a html string, false will return AnalysisReport object.
 * @param {Options} [opts={}] - optional various options to pass along the application
 * @returns {Promise<string|import('@trustification/exhort-api-spec/model/v4/AnalysisReport').AnalysisReport>}
 * @throws {Error} if manifest inaccessible, no matching provider, failed to get create content,
 * 		or backend request failed
 */
async function stackAnalysis(manifest, html = false, opts = {}) {
	theUrl = selectExhortBackend(opts)
	fs.accessSync(manifest, fs.constants.R_OK) // throws error if file unreadable
	let provider = match(manifest, availableProviders) // throws error if no matching provider
	return await analysis.requestStack(provider, manifest, theUrl, html, opts) // throws error request sending failed
}

/**
 * Get component analysis report for a manifest content.
 * @param {string} manifest - path to the manifest
 * @param {Options} [opts={}] - optional various options to pass along the application
 * @returns {Promise<import('@trustification/exhort-api-spec/model/v4/AnalysisReport').AnalysisReport>}
 * @throws {Error} if no matching provider, failed to get create content, or backend request failed
 */
async function componentAnalysis(manifest, opts = {}) {
	theUrl = selectExhortBackend(opts)
	fs.accessSync(manifest, fs.constants.R_OK)
	opts["manifest-type"] = path.basename(manifest)
	let provider = match(manifest, availableProviders) // throws error if no matching provider
	return await analysis.requestComponent(provider, manifest, theUrl, opts) // throws error request sending failed
}

/**
 * @overload
 * @param {Array<string>} imageRefs
 * @param {true} html
 * @param {Options} [opts={}]
 * @returns {Promise<string>}
 * @throws {Error}
 */

/**
 * @overload
 * @param {Array<string>} imageRefs
 * @param {false} html
 * @param {Options} [opts={}]
 * @returns {Promise<Object.<string, import('@trustification/exhort-api-spec/model/v4/AnalysisReport').AnalysisReport>>}
 * @throws {Error}
 */

/**
 * Get image analysis report for a set of OCI image references.
 * @overload
 * @param {Array<string>} imageRefs - OCI image references
 * @param {boolean} [html=false] - true will return a html string, false will return AnalysisReport
 * @param {Options} [opts={}] - optional various options to pass along the application
 * @returns {Promise<string|Object.<string, import('@trustification/exhort-api-spec/model/v4/AnalysisReport').AnalysisReport>>}
 * @throws {Error} if manifest inaccessible, no matching provider, failed to get create content,
 * 		or backend request failed
 */
async function imageAnalysis(imageRefs, html = false, opts = {}) {
	theUrl = selectExhortBackend(opts)
	return await analysis.requestImages(imageRefs, theUrl, html, opts)
}

/**
 * Validates the Exhort token.
 * @param {Options} [opts={}] - Optional parameters, potentially including token override.
 * @returns {Promise<object>} A promise that resolves with the validation result from the backend.
 * @throws {Error} if the backend request failed.
 */
async function validateToken(opts = {}) {
	theUrl = selectExhortBackend(opts)
	return await analysis.validateToken(theUrl, opts) // throws error request sending failed
}
