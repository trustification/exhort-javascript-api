import { EOL } from "os";
import os from 'os';
import { execFileSync, execSync } from "child_process";

export const RegexNotToBeLogged = /EXHORT_.*_TOKEN|ex-.*-token/
/**
 *
 * @param {string} key to log its value from environment variables and from opts, if it exists
 * @param {{}} [opts={}] different options of application, if key in it, log it.
 * @param {string }defValue default value of key in case there is no option and environment variable values for key
 */
export function logValueFromObjects(key,opts, defValue) {
	if(key in opts) {
		console.log(`value of option with key ${key} = ${opts[key]} ${EOL}`)
	}
	else
	{
		console.log(`key ${key} doesn't exists on opts object ${EOL}`)
	}
	if(key in process.env) {
		console.log(`value of environment variable ${key} = ${process.env[key]} ${EOL}`)
	}
	else
	{
		console.log(`environment variable ${key} doesn't exists ${EOL}`)
	}
	console.log(`default value for ${key} = ${defValue} ${EOL}`)
}

/**
 * Utility function will return the value for key from the environment variables,
 * if not present will return the value for key from the opts objects only if it's a string,
 * if not present, or not string will return the default value supplied which default to null.
 * @param {string} key the key to look for in the environment variables and the opts object
 * @param {string|null} [def=null] the value to return if nothing else found
 * @param {{}} [opts={}] the options object to look for the key in if not found in environment
 * @returns {string|null} the value of the key found in the environment, options object, or the
 * 		default supplied
 */
export function getCustom(key, def = null, opts = {}) {
	if (process.env["EXHORT_DEBUG"] === "true" && !key.match(RegexNotToBeLogged)) {
		logValueFromObjects(key, opts, def)
	}
	return key in process.env ? process.env[key] : key in opts && typeof opts[key] === 'string' ? opts[key] : def
}

/**
 * Utility function for looking up custom variable for a binary path.
 * Will look in the environment variables (1) or in opts (2) for a key with EXHORT_x_PATH, x is an
 * uppercase version of passed name to look for. The name will also be returned if nothing else was
 * found.
 * @param name the binary name to look for, will be returned as value in nothing else found
 * @param {{}} [opts={}] the options object to look for the key in if not found in environment
 * @returns {string|null} the value of the key found in the environment, options object, or the
 * 		original name supplied
 */
export function getCustomPath(name, opts = {}) {
	return getCustom(`EXHORT_${name.toUpperCase()}_PATH`, name, opts)
}

/**
 * Utility function for determining whether wrappers for build tools such as gradlew/mvnw should be
 * preferred over invoking the binary directly.
 * @param {string} name - binary for which to search for its wrapper
 * @param {{}} opts - the options object to look for the key in if not found in environment
 * @returns {boolean} whether to prefer the wrapper if exists or not
 */
export function getWrapperPreference(name, opts = {}) {
	return getCustom(`EXHORT_PREFER_${name.toUpperCase()}W`, 'true', opts) === 'true'
}

export function environmentVariableIsPopulated(envVariableName) {
	return envVariableName in process.env && process.env[envVariableName].trim() !== "";
}

/**
 *
 * @param {string} path - path to be checked if contains spaces
 * @return {string} a path with all spaces escaped or manipulated so it will be able to be part
 *                  of commands that will be invoked without errors in os' shell.
 */
export function handleSpacesInPath(path) {
	let transformedPath = path
	// if operating system is windows
	if (os.platform() === "win32") {
		if(hasSpaces(path)) {
			transformedPath = `"${path}"`
		}
	}
	// linux, darwin..
	else {
		if(hasSpaces(path)) {
			transformedPath = path.replaceAll(" ", "\\ ")
		}
	}
	return transformedPath
}

/**
 *
 * @param {string} path the path to check if contains spaces
 * @return {boolean} returns true if path contains spaces
 * @private
 */
function hasSpaces(path) {
	return path.trim().includes(" ")
}

/**
 *
 * @param {string} cwd - directory for which to find the root of the git repository.
 */
export function getGitRootDir(cwd) {
	try {
		const root = invokeCommand('git', ['rev-parse', '--show-toplevel'], {cwd: cwd})
		return root.toString().trim()
	} catch (error) {
		return undefined
	}
}

/** this method invokes command string in a process in a synchronous way.
 * @param {string} bin - the command to be invoked
 * @param {Array<string>} args - the args to pass to the binary
 */
export function invokeCommand(bin, args, opts={}) {
	// .bat and .cmd files can't be executed in windows with execFileSync, so we special case them
	// to use execSync here to keep the amount of escaping we need to do to a minimum.
	// https://nodejs.org/docs/latest-v20.x/api/child_process.html#spawning-bat-and-cmd-files-on-windows
	if (process.platform === 'win32' && (bin.endsWith(".bat") || bin.endsWith(".cmd"))) {
		args = args.map(arg => handleSpacesInPath(arg))
		return execSync(`${handleSpacesInPath(bin)} ${args.join(" ")}`, {...{stdio: 'pipe', encoding: 'utf-8'}, ...opts})
	}

	return execFileSync(bin, args, {...{stdio: 'pipe', encoding: 'utf-8'}, ...opts})
}
