export default class Yarn_processor {

	constructor(manifest) {
		this._manifest = manifest;
	}

	installCmd() {
		throw new Error('Method "installCmd" must be implemented.');
	}

	listDepsCmd() {
		throw new Error('Method "listDepsCmd" must be implemented.');
	}

	getRootDependencies() {
		throw new Error('Method "getRootDependencies" must be implemented.');
	}

	addDependenciesToSbom() {
		throw new Error('Method "addDependenciesToSbom" must be implemented.');
	}

	parseDepTreeOutput() {
		throw new Error('Method "parseDepTreeOutput" must be implemented.');
	}

}
