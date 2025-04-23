import Base_javascript from './base_javascript.js';

export default class Javascript_npm extends Base_javascript {

	_lockFileName() {
		return "package-lock.json";
	}

	_cmdName() {
		return "npm";
	}

	_listCmdArgs(includeTransitive, manifestDir) {
		const depthArg = includeTransitive ? "--all" : "--depth=0";
		const manifestArg = manifestDir ? `--prefix ${manifestDir}` : "";

		return `${this._cmdName()} ls ${depthArg} --package-lock-only --omit=dev --json ${manifestArg}`;
	}

	_updateLockFileCmdArgs(manifestDir) {
		const manifestArg = manifestDir ? `--dir ${manifestDir}` : "";
		return `${this._cmdName()} install --package-lock-only ${manifestArg}`;
	}

}
