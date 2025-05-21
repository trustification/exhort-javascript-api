/**
* Class representing a Platform with OS, architecture, and variant information
*/
export class Platform {
	static EMPTY = new Platform(null, null, null);

	// $GOOS and $GOARCH
	// https://github.com/docker-library/bashbrew/blob/v0.1.2/architecture/oci-platform.go#L14-L27
	static SUPPORTED_PLATFORMS = [
		new Platform('linux', 'amd64', null),
		new Platform('linux', 'arm', 'v5'),
		new Platform('linux', 'arm', 'v6'),
		new Platform('linux', 'arm', 'v7'),
		new Platform('linux', 'arm64', 'v8'),
		new Platform('linux', '386', null),
		new Platform('linux', 'mips64le', null),
		new Platform('linux', 'ppc64le', null),
		new Platform('linux', 'riscv64', null),
		new Platform('linux', 's390x', null),
		new Platform('windows', 'arm64', null)
	];

	/**
	 * Create a Platform instance
	 * @param {string|null} os - Operating system
	 * @param {string|null} architecture - Architecture
	 * @param {string|null} [variant] - Architecture variant
	 * @private
	 */
	constructor(os, architecture, variant) {
		this.os = os;
		this.architecture = architecture;
		this.variant = variant;
	}

	/**
	 * Get the variant for the given OS and architecture
	 * @param {string} os - Operating system
	 * @param {string} arch - Architecture
	 * @returns {string|null} - Variant or null
	 */
	static getVariant(os, arch) {
		if (os === 'linux' && arch === 'arm64') { // in case variant "v8" is not specified
			return 'v8';
		}
		return null;
	}

	/**
	 * Check if a variant is required for the given OS and architecture
	 * @param {string} os - Operating system
	 * @param {string} arch - Architecture
	 * @returns {boolean} - True if variant is required
	 */
	static isVariantRequired(os, arch) {
		return os === 'linux' && arch === 'arm';
	}

	/**
	 * Create a platform from a string
	 * @param {string} platform - Platform string in format "os/arch" or "os/arch/variant"
	 * @returns {Platform} - Platform instance
	 * @throws {Error} - If platform string is invalid or not supported
	 */
	static fromString(platform) {
		if (platform == null) {
			throw new Error(`Invalid platform: ${platform}`);
		}

		const parts = platform.split('/');
		let os, arch, variant;

		if (parts.length === 1) {
			os = 'linux';
			arch = parts[0];
		} else if (parts.length === 2) {
			os = parts[0];
			arch = parts[1];
			variant = Platform.getVariant(os, arch);
		} else if (parts.length === 3) {
			os = parts[0];
			arch = parts[1];
			variant = parts[2];
		} else {
			throw new Error(`Invalid platform: ${platform}`);
		}

		const platformObj = new Platform(os, arch, variant);

		if (!Platform.isSupported(platformObj)) {
			throw new Error(`Image platform is not supported: ${platformObj.toString()}`);
		}

		return platformObj;
	}

	/**
	 * Create a platform from individual components
	 * @param {string|null} os - Operating system
	 * @param {string} arch - Architecture
	 * @param {string|null} variant - Architecture variant
	 * @returns {Platform} - Platform instance
	 * @throws {Error} - If platform is invalid or not supported
	 */
	static fromComponents(os, arch, variant) {
		if (arch == null) {
			throw new Error(`Invalid platform arch: ${arch}`);
		}

		// Default to linux if OS is not specified
		if (os == null) {
			os = 'linux';
		}

		// Get default variant if not specified
		if (variant == null) {
			variant = Platform.getVariant(os, arch);
		}

		const platformObj = new Platform(os, arch, variant);

		if (!Platform.isSupported(platformObj)) {
			throw new Error(`Image platform is not supported: ${os}/${arch}/${variant}`);
		}

		return platformObj;
	}

	/**
	 * Check if a platform is supported
	 * @param {Platform} platform - Platform to check
	 * @returns {boolean} - True if platform is supported
	 */
	static isSupported(platform) {
		return Platform.SUPPORTED_PLATFORMS.some(p =>
			p.os === platform.os &&
			p.architecture === platform.architecture &&
			// eslint-disable-next-line eqeqeq
			p.variant == platform.variant
		);
	}

	/**
	 * Convert a platform to a string
	 * @returns {string} - String representation of platform
	 */
	toString() {
		if (this.variant == null) {
			return `${this.os}/${this.architecture}`;
		} else {
			return `${this.os}/${this.architecture}/${this.variant}`;
		}
	}
}
