import Base_javascript from './base_javascript.js';

export default class Javascript_npm extends Base_javascript {

	_lockFileName() {
		return "package-lock.json";
	}

	_cmdName() {
		return "npm";
	}

	_listCmdArgs(includeTransitive) {
		return ['ls', includeTransitive ? '--all' : '--depth=0', '--package-lock-only', '--omit=dev', '--json'];
	}

	_updateLockFileCmdArgs() {
		return ['install', '--package-lock-only'];
	}
}
