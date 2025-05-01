import Base_javascript from './base_javascript.js';

export default class Javascript_pnpm extends Base_javascript {

	_lockFileName() {
		return "pnpm-lock.yaml";
	}

	_cmdName() {
		return "pnpm";
	}

	_listCmdArgs(includeTransitive) {
		return ['ls', includeTransitive ? '--depth=Infinity' : '--depth=0', '--prod', '--json'];
	}

	_updateLockFileCmdArgs() {
		return ['install', '--frozen-lockfile'];
	}

	_buildDependencyTree(includeTransitive, manifest) {
		const tree = super._buildDependencyTree(includeTransitive, manifest);
		if (Array.isArray(tree) && tree.length > 0) {
			return tree[0];
		}
		return {};
	}

}
