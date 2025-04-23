import { expect } from 'chai'
import fs from 'fs'
import sinon from "sinon";
import { availableProviders, match } from '../../src/provider.js';
import esmock from 'esmock';
import { fail } from 'assert';

let clock

async function mockProvider(providerName, listingOutput) {

	const mockExecSync = (cmd) => {
		if (cmd.includes('--version')) { return ''; }
		return listingOutput;
	}

	return esmock(`../../src/providers/Javascript_${providerName}.js`, {
		'../../src/providers/Base_javascript.js': await esmock('../../src/providers/base_javascript.js', {
			'node:child_process': {
				execSync: mockExecSync
			}
		})
	});
}

async function createMockProvider(providerName, listingOutput) {
	switch (providerName) {
	case 'npm': {
		const Javascript_npm = await mockProvider(providerName, listingOutput);
		return new Javascript_npm();
	}
	case 'pnpm': {
		const Javascript_pnpm = await mockProvider(providerName, listingOutput);
		return new Javascript_pnpm();
	}
	default: { fail('Not implemented'); }
	}
}

suite('testing the javascript-npm data provider', async () => {
	[
		{ name: 'npm/with_lock_file', validation: true },
		{ name: 'npm/without_lock_file', validation: false },
		{ name: 'pnpm/with_lock_file', validation: true },
		{ name: 'pnpm/without_lock_file', validation: false },
		// Once Yarn is supported the expected values can change
		{ name: 'yarn/with_lock_file', validation: false },
		{ name: 'yarn/without_lock_file', validation: false }
	].forEach(testCase => {
		test(`verify isSupported returns ${testCase.expected} for ${testCase.name}`, () => {
			let manifest = `test/providers/provider_manifests/${testCase.name}/package.json`;
			try {
				const provider = match(manifest, availableProviders);
				expect(provider).not.to.be.null;
				expect(testCase.validation).to.be.true;
			} catch (e) {
				expect(testCase.validation).to.be.false;
			}
		})
	});
	['npm', 'pnpm'].flatMap(providerName => [
		"package_json_deps_without_exhortignore_object",
		"package_json_deps_with_exhortignore_object"
	].map(testCase => ({ providerName, testCase }))).forEach(({ providerName, testCase }) => {
		let scenario = testCase.replace('package_json_deps_', '').replaceAll('_', ' ')
		test(`verify package.json data provided for ${providerName} - stack analysis - ${scenario}`, async () => {
			// load the expected graph for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/${providerName}/${testCase}/stack_expected_sbom.json`,).toString();
			let npmListing = fs.readFileSync(`test/providers/tst_manifests/${providerName}/${testCase}/listing_stack.json`,).toString();

			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			const provider = await createMockProvider(providerName, npmListing);
			let providedDataForStack = provider.provideStack(`test/providers/tst_manifests/${providerName}/${testCase}/package.json`)

			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'npm',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})

		}).timeout(process.env.GITHUB_ACTIONS ? 30000 : 10000);
		test(`verify package.json data provided for ${providerName} - component analysis - ${scenario}`, async () => {
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/${providerName}/${testCase}/component_expected_sbom.json`,).toString().trim()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			let npmListing = fs.readFileSync(`test/providers/tst_manifests/${providerName}/${testCase}/listing_component.json`,).toString()

			// verify returned data matches expectation
			const provider = await createMockProvider(providerName, npmListing);
			let providedDataForComponent = provider.provideComponent(`test/providers/tst_manifests/${providerName}/${testCase}/package.json`)

			expect(providedDataForComponent).to.deep.equal({
				ecosystem: 'npm',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
		}).timeout(process.env.GITHUB_ACTIONS ? 15000 : 10000)

	})


}).beforeAll(() => clock = sinon.useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(() => clock.restore());
