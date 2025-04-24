import Base_javascript from './base_javascript.js';

export default class Javascript_pnpm extends Base_javascript {

	_lockFileName() {
		return "pnpm-lock.yaml";
	}

	_cmdName() {
		return "pnpm";
	}

	_listCmdArgs(includeTransitive, manifestDir) {
		const args = ['ls', includeTransitive ? '--depth=Infinity' : '--depth=0', '--prod', '--json'];
		if (manifestDir) {
			args.push('--dir', manifestDir);
		}
		return args;
	}

	_updateLockFileCmdArgs(manifestDir) {
		const args = ['install', '--frozen-lockfile'];
		if (manifestDir) {
			args.push('--dir', manifestDir)
		}
		args.push(...[])
		return args;
	}

	_buildDependencyTree(includeTransitive, manifest) {
		const tree = super._buildDependencyTree(includeTransitive, manifest);
		if (Array.isArray(tree) && tree.length > 0) {
			return tree[0];
		}
		return {};
	}

}
