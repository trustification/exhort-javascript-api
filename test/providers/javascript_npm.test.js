import { expect } from 'chai'
import fs from 'fs'
import path from "node:path";
import sinon from "sinon";
// import babelCore from 'babel-core'
import javascriptNpmProvider from "../../src/providers/javascript_npm.js"
import {rewireProvider} from "./test-utils.js";

let javascriptNpmProviderRewire = await rewireProvider("src/providers/javascript_npm")

let clock


// async function rewireProvider()
// {
// 	let jsNpmProvider = fs.readFileSync("src/providers/javascript_npm.js")
// 	let javascriptNpmProviderSource = babelCore.transform(jsNpmProvider, {plugins: ["babel-plugin-rewire"]}).code;
// 	fs.writeFileSync("src/providers/javascript_npm_rewire.js",javascriptNpmProviderSource)
// 	javascriptNpmProviderRewire = await import("../../src/providers/javascript_npm_rewire.js")
// }

suite('testing the javascript-npm data provider', async() => {
	[
		{name: 'npm/with_lock_file', isSupported: true, lockValidationPass: true},
		{name: 'npm/without_lock_file', isSupported: true, lockValidationPass: false},
		// Once Yarn is supported the expected values can change
		{name: 'yarn/with_lock_file', isSupported: true, lockValidationPass: false},
		{name: 'yarn/without_lock_file', isSupported: true, lockValidationPass: false}
	].forEach(testCase => {
		test(`verify isSupported returns ${testCase.expected} for ${testCase.name}`, () => {
			let manifestPath = path.parse(`test/providers/provider_manifests/${testCase.name}/package.json`)
			expect(javascriptNpmProvider.isSupported(manifestPath.base)).to.equal(testCase.isSupported)

			let validationPassed;
			try {
				javascriptNpmProvider.validateLockFile(manifestPath.dir);
				validationPassed = true;
			} catch (e) {
				validationPassed = false;
			}
			expect(validationPassed).to.equal(testCase.lockValidationPass);
		})
	});
	[
		"package_json_deps_without_exhortignore_object",
		"package_json_deps_with_exhortignore_object"
	].forEach(testCase => {
		let scenario = testCase.replace('package_json_deps_', '').replaceAll('_', ' ')
		test(`verify package.json data provided for stack analysis with scenario ${scenario}`, async () => {
			// javascriptNpmProviderRewire = await rewireProvider("src/providers/javascript_npm")
			// load the expected graph for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/stack_expected_sbom.json`,).toString()
			let npmListing = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/npm_listing_stack.json`,).toString()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			let mpmMockedInteractions = {
				listing: () => npmListing,
				version: () => void (0),
				createPackageLock: () => void (0)
			}
			javascriptNpmProviderRewire.__set__('npmInteractions', mpmMockedInteractions)
			// invoke sut stack analysis for scenario manifest
			let providedDataForStack =  javascriptNpmProviderRewire.__get__("provideStack")(`test/providers/tst_manifests/npm/${testCase}/package.json`)
			// new(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date

			// providedDataForStack.content = providedDataForStack.content.replaceAll("\"timestamp\":\"[a-zA-Z0-9\\-\\:]+\"","")
			// verify returned data matches expectation
			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'npm',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			javascriptNpmProviderRewire.__ResetDependency__()
			// javascriptNpmProviderSource.runNpmListing.restore()
			// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 30000 : 10000);
		test(`verify package.json data provided for component analysis with scenario ${scenario}`, async () => {
			// javascriptNpmProviderRewire = await rewireProvider("src/providers/javascript_npm")
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/component_expected_sbom.json`,).toString().trim()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			let npmListing = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/npm_listing_component.json`,).toString()
			// read target manifest file
			let manifestContent = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/package.json`).toString()
			// sinon.stub(javascriptNpmProviderSource,'runNpmListing').callsFake(() => npmListing)
			let mpmMockedInteractions = {
				listing: () => npmListing,
				version: () => void (0),
				createPackageLock: () => void (0)
			}
			javascriptNpmProviderRewire.__set__('npmInteractions', mpmMockedInteractions)
			// invoke sut stack analysis for scenario manifest
			let providedDataForStack = await javascriptNpmProviderRewire.__get__("provideComponent")(manifestContent)
			// verify returned data matches expectation
			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'npm',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			javascriptNpmProviderRewire.__ResetDependency__()
			// javascriptNpmProviderSource.runNpmListing.restore()
			// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 15000 : 10000)

		// test(`check quick integration component analysis  ${scenario}`, async () =>{
		// 	let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/npm/${testCase}/package.json`,).toString().trim()
		// 	let analysisReport = await exhort.componentAnalysis("package.json", expectedSbom);
		// 	console.log(analysisReport)
		//
		// }).timeout(process.env.GITHUB_ACTIONS ? 15000 : 5000)
		// test(`check quick integration stack analysis with ${scenario}`, async () =>{
		//
		// 	let analysisReportJson = await exhort.stackAnalysis(`test/providers/tst_manifests/npm/${testCase}/package.json`,false)
		// 	console.log(analysisReportJson)
		//
		// }).timeout(process.env.GITHUB_ACTIONS ? 15000 : 5000)

	})


}).beforeAll(() => clock = sinon.useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(()=> clock.restore());
