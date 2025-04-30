import Base_javascript from './base_javascript.js';
import Yarn_berry_processor from './processors/yarn_berry_processor.js';
import Yarn_classic_processor from './processors/yarn_classic_processor.js';

export default class Javascript_yarn extends Base_javascript {

	static VERSION_PATTERN = /^([0-9]+)\./;

	#processor;

	_lockFileName() {
		return "yarn.lock";
	}

	_cmdName() {
		return "yarn";
	}

	_listCmdArgs(includeTransitive, manifestDir) {
		return this.#processor.listCmdArgs(includeTransitive, manifestDir);
	}

	_updateLockFileCmdArgs(manifestDir) {
		return this.#processor.updateLockFileCmdArgs(manifestDir);
	}

	_setUp(manifestPath, opts) {
		super._setUp(manifestPath, opts);

		const version = this._version() ?? '';
		const matches = Javascript_yarn.VERSION_PATTERN.exec(version);

		if (matches?.length !== 2) {
			throw new Error(`Invalid Yarn version format: ${version}`);
		}

		const isClassic = matches[1] === '1';
		this.#processor = isClassic ? new Yarn_classic_processor(this._getManifest()) : new Yarn_berry_processor(this._getManifest());
	}

	_getRootDependencies(depTree) {
		return this.#processor.getRootDependencies(depTree);
	}

	_parseDepTreeOutput(output) {
		return this.#processor.parseDepTreeOutput(output);
	}

	_addDependenciesToSbom(sbom, depTree) {
		this.#processor.addDependenciesToSbom(sbom, depTree);
	}

}
