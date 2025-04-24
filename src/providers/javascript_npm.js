import Base_javascript from './base_javascript.js';

export default class Javascript_npm extends Base_javascript {

	_lockFileName() {
		return "package-lock.json";
	}

	_cmdName() {
		return "npm";
	}

	_listCmdArgs(includeTransitive, manifestDir) {
		const args = ['ls', includeTransitive ? '--all' : '--depth=0', '--package-lock-only', '--omit=dev', '--json']
		if (manifestDir) {
			args.push('--prefix', manifestDir)
		}
		return args
	}

	_updateLockFileCmdArgs(manifestDir) {
		const args = ['install', '--package-lock-only']
		if (manifestDir) {
			args.push('--dir', manifestDir)
		}
		return args;
	}
}
