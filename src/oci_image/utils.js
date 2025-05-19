import { execFileSync } from 'child_process';
import { getCustomPath } from '../tools.js';
import { Platform } from './platform.js';
import { delimiter, sep } from 'path';
import { ImageRef } from './images.js';

// Constants
const EXHORT_SYFT_CONFIG_PATH = "EXHORT_SYFT_CONFIG_PATH";
const EXHORT_SYFT_IMAGE_SOURCE = "EXHORT_SYFT_IMAGE_SOURCE";
const EXHORT_IMAGE_PLATFORM = "EXHORT_IMAGE_PLATFORM";
const EXHORT_IMAGE_OS = "EXHORT_IMAGE_OS";
const EXHORT_IMAGE_ARCH = "EXHORT_IMAGE_ARCH";
const EXHORT_IMAGE_VARIANT = "EXHORT_IMAGE_VARIANT";
const EXHORT_SKOPEO_CONFIG_PATH = "EXHORT_SKOPEO_CONFIG_PATH";
const EXHORT_IMAGE_SERVICE_ENDPOINT = "EXHORT_IMAGE_SERVICE_ENDPOINT";
const MEDIA_TYPE_DOCKER2_MANIFEST = "application/vnd.docker.distribution.manifest.v2+json";
const MEDIA_TYPE_DOCKER2_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
const MEDIA_TYPE_OCI1_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
const MEDIA_TYPE_OCI1_MANIFEST_LIST = "application/vnd.oci.image.index.v1+json";

const archMapping = {
	"amd64": "amd64",
	"x86_64": "amd64",
	"armv5tl": "arm",
	"armv5tel": "arm",
	"armv5tejl": "arm",
	"armv6l": "arm",
	"armv7l": "arm",
	"armv7ml": "arm",
	"arm64": "arm64",
	"aarch64": "arm64",
	"i386": "386",
	"i486": "386",
	"i586": "386",
	"i686": "386",
	"mips64le": "mips64le",
	"ppc64le": "ppc64le",
	"riscv64": "riscv64",
	"s390x": "s390x"
};

const variantMapping = {
	"armv5tl": "v5",
	"armv5tel": "v5",
	"armv5tejl": "v5",
	"armv6l": "v6",
	"armv7l": "v7",
	"armv7ml": "v7",
	"arm64": "v8",
	"aarch64": "v8"
};

/**
 *
 * @param {import('./images').ImageRef} imageRef
 * @returns {{}}
 */
export function generateImageSBOM(imageRef) {
	const output = execSyft(imageRef);

	const node = JSON.parse(output);
	if (node['metadata'] != null) {
		const metadata = node['metadata'];
		if (metadata['component'] != null && typeof metadata['component'] === 'object') {
			const imagePurl = imageRef.getPackageURL().toString()
			metadata['component']['purl'] = imagePurl
			return node
		}
	}
}

/**
 *
 * @param {string} image
 * @returns {ImageRef}
 */
export function parseImageRef(image) {
	const parts = image.split('^^')
	if (parts[0].trim() === image) {
		return new ImageRef(image, null)
	} else if (parts.length === 2) {
		return new ImageRef(parts[0], parts[1])
	} else {
		throw new Error(`Failed to parse OCI image ref "${image}", should be in the format "image^^architecture" or "image"`)
	}
}

/**
* Executes Syft to generate SBOM
* @param {import('./images').ImageRef} imageRef - The image reference
*/
function execSyft(imageRef) {
	const syft = getCustomPath("syft");
	const docker = getCustomPath("docker");
	const podman = getCustomPath("podman");

	const syftConfigPath = process.env[EXHORT_SYFT_CONFIG_PATH] ?? '';
	const imageSource = process.env[EXHORT_SYFT_IMAGE_SOURCE] ?? '';
	// Confirm image source exists, this will throw an error if not
	getImageSource(imageSource);

	const dockerPath =
		docker?.includes(sep)
			? docker.substring(0, docker.lastIndexOf(sep) + 1)
			: "";
	const podmanPath =
		podman?.includes(sep)
			? podman.substring(0, podman.lastIndexOf(sep) + 1)
			: "";
	const envs = getSyftEnvs(dockerPath, podmanPath);

	const scheme = imageRef.image.getFullName()

	const args = [
		scheme,
		"-s",
		"all-layers",
		"-o",
		"cyclonedx-json@1.5",
		"-q",
		...(syftConfigPath ? [
			"-c",
			syftConfigPath,
		] : []),
		...(imageSource ? [
			"--from",
			imageSource,
		] : [])
	];

	return execFileSync(syft, args, {
		env: { ...process.env, ...envs },
	});
}

/**
* Gets the environment variables for Syft
* @param {string} dockerPath - The Docker path
* @param {string} podmanPath - The Podman path
* @returns {Array<string>} - The environment variables
*/
function getSyftEnvs(dockerPath, podmanPath) {
	let path = null;
	if (dockerPath && podmanPath) {
		path = `${dockerPath}${File.pathSeparator}${podmanPath}`;
	} else if (dockerPath) {
		path = dockerPath;
	} else if (podmanPath) {
		path = podmanPath;
	}

	const prependPath = () => {
		const systemPath = process.env["PATH"];
		if (systemPath) {
			return `${systemPath}${delimiter}${path}`;
		} else {
			return `${path}`;
		}
	}
	return path ? { 'PATH': prependPath() } : {};
}

/**
* Gets the platform information for an image
* @returns {Platform|null} - The platform information or null
*/
export function getImagePlatform() {
	const platform = process.env[EXHORT_IMAGE_PLATFORM];
	if (platform) {
		return Platform.fromString(platform)
	}

	const imageSource = process.env[EXHORT_SYFT_IMAGE_SOURCE] ?? '';
	const source = getImageSource(imageSource);

	let os = process.env[EXHORT_IMAGE_OS];
	if (!os) {
		os = source.getOs();
	}
	let arch = process.env[EXHORT_IMAGE_ARCH];
	if (!arch) {
		arch = source.getArch();
	}
	if (os && arch) {
		if (!Platform.isVariantRequired(os, arch)) {
			return Platform.fromComponents(os, arch, null);
		}

		let variant = process.env[EXHORT_IMAGE_VARIANT];
		if (!variant) {
			variant = source.getVariant();
		}
		if (variant) {
			return Platform.fromComponents(os, arch, variant);
		}
	}

	return null;
}

/**
* Gets information about a host from a container engine
* @param {string} engine - The container engine name
* @param {string} info - The information to retrieve
* @returns {string} - The host information
*/
function hostInfo(engine, info) {
	const exec = getCustomPath(engine);

	const output = execFileSync(exec, ["info"]).toString();

	const lines = output.split("\n");
	for (const line of lines) {
		const trimmedLine = line.trimStart();
		if (trimmedLine.startsWith(`${info}:`)) {
			return line.trim().substring(info.length + 1).trim();
		}
	}
	return "";
}

/**
 * Gets the OS information from Docker
 * @returns {string} - The OS information
 */
function dockerGetOs() {
	return hostInfo("docker", "OSType");
}

/**
 * Gets the architecture information from Docker
 * @returns {string} - The architecture information
 */
function dockerGetArch() {
	let arch = hostInfo("docker", "Architecture");
	arch = archMapping[arch];
	return arch || "";
}

/**
 * Gets the variant information from Docker
 * @returns {string} - The variant information
 */
function dockerGetVariant() {
	let variant = hostInfo("docker", "Architecture");
	variant = variantMapping[variant];
	return variant || "";
}

/**
 * Gets the OS information from Podman
 * @returns {string} - The OS information
 */
function podmanGetOs() {
	return hostInfo("podman", "os");
}

/**
 * Gets the architecture information from Podman
 * @returns {string} - The architecture information
 */
function podmanGetArch() {
	return hostInfo("podman", "arch");
}

/**
 * Gets the variant information from Podman
 * @returns {string} - The variant information
 */
function podmanGetVariant() {
	return hostInfo("podman", "variant");
}

/**
 * Gets information from Docker or Podman
 * @param {function(): string} dockerSupplier - function to get information from Docker
 * @param {function(): string} podmanSupplier - function to get information from Podman
 * @returns {string} - The information
 */
function dockerPodmanInfo(dockerSupplier, podmanSupplier) {
	return dockerSupplier() ?? podmanSupplier();
}

/**
 * Gets the digests for an image
 * @param {import('./images').ImageRef} imageRef - The image reference
 * @returns {Object.<string, string>} - The image digests
 * @throws {Error} If the image info is invalid
 */
export function getImageDigests(imageRef) {
	const output = execSkopeoInspect(imageRef, true);

	const node = JSON.parse(output);
	if (node.mediaType) {
		const mediaType = node.mediaType;
		if (typeof mediaType === 'string') {
			switch (mediaType) {
			case MEDIA_TYPE_OCI1_MANIFEST:
			case MEDIA_TYPE_DOCKER2_MANIFEST:
				return getSingleImageDigest(imageRef);

			case MEDIA_TYPE_OCI1_MANIFEST_LIST:
			case MEDIA_TYPE_DOCKER2_MANIFEST_LIST:
				return getMultiImageDigests(node);
			}
		}
	}

	throw new Error(`The image info is invalid: ${output}`);
}

/**
 * Gets digests for multiple images
 * @param {Object} node - The JSON node
 * @returns {Object.<string, string>} - The image digests
 */
function getMultiImageDigests(node) {
	if (node.manifests && Array.isArray(node.manifests)) {
		return node.manifests
			.filter(filterMediaType)
			.filter(filterDigest)
			.filter(filterPlatform)
			.reduce((result, manifestNode) => {
				const platformNode = manifestNode.platform;
				const arch = platformNode.architecture;
				const os = platformNode.os;
				let platform;

				if (platformNode.variant) {
					platform = Platform.fromComponents(os, arch, platformNode.variant);
				} else {
					platform = Platform.fromComponents(os, arch);
				}

				result[platform.toString()] = manifestNode.digest;
				return result;
			}, {});
	}
	return {};
}

/**
 * Filters manifest nodes by media type
 * @param {Object} manifestNode - The manifest node
 * @returns {boolean} - Whether the node passes the filter
 */
function filterMediaType(manifestNode) {
	if (manifestNode.mediaType) {
		const mediaType = manifestNode.mediaType;
		if (typeof mediaType === 'string') {
			return mediaType === MEDIA_TYPE_OCI1_MANIFEST ||
				mediaType === MEDIA_TYPE_DOCKER2_MANIFEST;
		}
	}
	return false;
}

/**
 * Filters manifest nodes by digest
 * @param {Object} manifestNode - The manifest node
 * @returns {boolean} - Whether the node passes the filter
 */
function filterDigest(manifestNode) {
	return manifestNode.digest && typeof manifestNode.digest === 'string';
}

/**
 * Filters manifest nodes by platform
 * @param {Object} manifestNode - The manifest node
 * @returns {boolean} - Whether the node passes the filter
 */
function filterPlatform(manifestNode) {
	if (manifestNode.platform && typeof manifestNode.platform === 'object') {
		const platformNode = manifestNode.platform;
		if (platformNode.architecture && platformNode.os &&
			typeof platformNode.architecture === 'string' &&
			typeof platformNode.os === 'string') {

			try {
				if (platformNode.variant && typeof platformNode.variant === 'string') {
					Platform.fromComponents(platformNode.os, platformNode.architecture, platformNode.variant);
					return true;
				}
				Platform.fromComponents(platformNode.os, platformNode.architecture);
				return true;
			} catch (e) {
				return false;
			}
		}
	}
	return false;
}

/**
 * Gets digest for a single image
 * @param {import('./images').ImageRef} imageRef - The image reference
 * @returns {Object.<string, string>} - The image digest
 */
function getSingleImageDigest(imageRef) {
	const output = execSkopeoInspect(imageRef, false);

	const node = JSON.parse(output);

	if (node.Digest && typeof node.Digest === 'string') {
		const result = {};
		result[Platform.EMPTY.toString()] = node.Digest;
		return result;
	}
	return {};
}

/**
 * Executes Skopeo inspect
 * @param {import('./images').ImageRef} imageRef - The image reference
 * @param {boolean} raw - Whether to use raw output
 */
function execSkopeoInspect(imageRef, raw) {
	const skopeo = getCustomPath("skopeo");

	const configPath = process.env[EXHORT_SKOPEO_CONFIG_PATH];
	const daemonHost = process.env[EXHORT_IMAGE_SERVICE_ENDPOINT];

	const args = [
		"inspect",
		raw ? "--raw" : "",
		`docker://${imageRef.image.getFullName()}`,
		...(configPath ? [
			"--authfile",
			configPath,
		] : []),
		...(daemonHost ? [
			"--daemon-host",
			daemonHost,
		] : [])
	]

	return execFileSync(skopeo, args);
}

/**
 * @typedef SyftImageSource
 * @type {object}
 * @property {function(): string} getOs
 * @property {function(): string} getArch
 * @property {function(): string} getVariant
 */

/** @type {Object.<string, SyftImageSource}} */
const SyftImageSource = {
	'': {
		getOs() { return dockerPodmanInfo(dockerGetOs, podmanGetOs); },
		getArch() { return dockerPodmanInfo(dockerGetArch, podmanGetArch); },
		getVariant() { return dockerPodmanInfo(dockerGetVariant, podmanGetVariant); }
	},
	'registry': {
		getOs() { return dockerPodmanInfo(dockerGetOs, podmanGetOs); },
		getArch() { return dockerPodmanInfo(dockerGetArch, podmanGetArch); },
		getVariant() { return dockerPodmanInfo(dockerGetVariant, podmanGetVariant); }
	},
	'docker': {
		getOs() { return dockerGetOs(); },
		getArch() { return dockerGetArch(); },
		getVariant() { return dockerGetVariant(); }
	},
	'podman': {
		getOs() { return podmanGetOs(); },
		getArch() { return podmanGetArch(); },
		getVariant() { return podmanGetVariant(); }
	}
};

/**
 * Gets an image source by name
 * @param {string} name - The image source name
 * @returns {Object} - The image source
 * @throws {Error} If the image source is not valid
 */
function getImageSource(name) {
	const source = SyftImageSource[name];
	if (!source) {
		throw new Error(`The image source for syft is not valid: ${name}`);
	}
	return source;
}
