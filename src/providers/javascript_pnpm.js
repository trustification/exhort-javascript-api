import Base_javascript from './base_javascript.js';

export default class Javascript_pnpm extends Base_javascript {

	_lockFileName() {
		return "pnpm-lock.yaml";
	}

	_cmdName() {
		return "pnpm";
	}

	_listCmdArgs(includeTransitive, manifestDir) {
		const depthArg = includeTransitive ? "--depth=Infinity" : "--depth=0";
		const manifestArg = manifestDir ? `--dir ${manifestDir}` : "";
		return `${this._cmdName()} ls ${depthArg} ${manifestArg} --prod --json`;
	}

	_updateLockFileCmdArgs(manifestDir) {
		const manifestArg = manifestDir ? `--dir ${manifestDir}` : "";
		return `${this._cmdName()} install --frozen-lockfile ${manifestArg}`;
	}

	_buildDependencyTree(includeTransitive, manifest) {
		const tree = super._buildDependencyTree(includeTransitive, manifest);
		if (Array.isArray(tree) && tree.length > 0) {
			return tree[0];
		}
		return {};
	}

}
