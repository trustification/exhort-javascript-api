import fs from "fs";

import { toPurl } from "../tools.js";

const DEFAULT_VERSION = 'v0.0.0';
export default class Manifest {

	constructor(manifestPath) {
		if (!manifestPath) {
			throw new Error("Missing required manifest path");
		}
		this.manifestPath = manifestPath;
		const content = this.loadManifest();
		this.dependencies = this.loadDependencies(content);
		this.name = content.name;
		this.version = content.version || DEFAULT_VERSION;
		this.ignored = this.loadIgnored(content);
	}

	loadManifest() {
		try {
			let manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
			return manifest;} catch (err) {
			if(err.code === 'ENOENT') {
				throw new Error("Missing manifest file: " + this.manifestPath, {cause: err});
			}
			throw new Error("Unable to parse manifest: " + this.manifestPath, {cause: err});
		}
	}

	loadDependencies(content) {
		let deps = [];
		if(!content.dependencies) {
			return deps;
		}
		for(let dep in content.dependencies) {
			deps.push(dep);
		}
		return deps;
	}

	loadIgnored(content) {
		let deps = [];
		if(!content.exhortignore) {
			return deps;
		}
		for(let i = 0; i < content.exhortignore.length; i++) {
			deps.push(toPurl("npm", content.exhortignore[i]));
		}
		return deps;
	}
}
