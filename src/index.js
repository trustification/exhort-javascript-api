import path from "node:path";
import { EOL } from "os";
import { availableProviders, match } from './provider.js'
import { AnalysisReport } from '../generated/backend/AnalysisReport.js'
import analysis from './analysis.js'
import fs from 'node:fs'
import { getCustom } from "./tools.js";
import.meta.dirname
import * as url from 'url';
// const packageJson = await import ('../package.json',{ with: { type: 'json' } })

export default { AnalysisReport, componentAnalysis, stackAnalysis, validateToken }

export const exhortDevDefaultUrl = 'https://exhort.stage.devshift.net';


export const exhortDefaultUrl = "https://rhda.rhcloud.com";


function logOptionsAndEnvironmentsVariables(alongsideText,valueToBePrinted) {
	if (process.env["EXHORT_DEBUG"] === "true") {
		console.log(`${alongsideText}: ${valueToBePrinted} ${EOL}`)
	}
}

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

/** This function is used to determine exhort theUrl backend according to the following logic:
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
function selectExhortBackend(opts= {}) {
	let result
	if (process.env["EXHORT_DEBUG"] === "true") {
		let packageJson = readAndPrintVersionFromPackageJson();
	}
	let exhortDevModeBundled = "false"
	let exhortDevMode = getCustom("EXHORT_DEV_MODE",exhortDevModeBundled,opts)
	if(exhortDevMode !== null && exhortDevMode.toString() === "true") {
		result = getCustom('DEV_EXHORT_BACKEND_URL',exhortDevDefaultUrl,opts);
	} else {
		result = exhortDefaultUrl
	}

	logOptionsAndEnvironmentsVariables("Chosen exhort backend URL:",result)

	return result;
}

/**
 *
 * @param opts
 * @return {string}
 */
export function testSelectExhortBackend(opts) {
	return selectExhortBackend(opts)
}

/**
 * @type {string} backend theUrl to send requests to
 * @private
 */
let theUrl

/**
 * Get stack analysis report for a manifest file.
 * @param {string} manifest - path for the manifest
 * @param {boolean} [html=false] - true will return a html string, false will return AnalysisReport
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Promise<string|AnalysisReport>}
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
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Promise<AnalysisReport>}
 * @throws {Error} if no matching provider, failed to get create content, or backend request failed
 */
async function componentAnalysis(manifest, opts = {}) {
	theUrl = selectExhortBackend(opts)
	fs.accessSync(manifest, fs.constants.R_OK)
	opts["manifest-type"] = path.basename(manifest)
	let provider = match(manifest, availableProviders) // throws error if no matching provider
	return await analysis.requestComponent(provider, manifest, theUrl, opts) // throws error request sending failed
}

async function validateToken(opts = {}) {
	theUrl = selectExhortBackend(opts)
	return await analysis.validateToken(theUrl, opts) // throws error request sending failed
}
