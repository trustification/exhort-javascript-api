import { expect } from 'chai'
import fs from 'fs'
import sinon from "sinon";
import pythonPip from "../../src/providers/python_pip.js"



let clock
suite('testing the python-pip data provider', () => {
	[
		{name: 'requirements.txt', expected: true},
		{name: 'some_other.file', expected: false}
	].forEach(testCase => {
		test(`verify isSupported returns ${testCase.expected} for ${testCase.name}`, () =>
			expect(pythonPip.isSupported(testCase.name)).to.equal(testCase.expected)
		)
	});

	[
		"pip_requirements_txt_no_ignore",
		"pip_requirements_txt_ignore"
	].forEach(testCase => {
		let scenario = testCase.replace('pip_requirements_', '').replaceAll('_', ' ')
		test(`verify requirements.txt sbom provided for stack analysis with scenario ${scenario}`, async () => {
			// load the expected graph for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/pip/${testCase}/expected_stack_sbom.json`,).toString()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			// invoke sut stack analysis for scenario manifest

			let providedDataForStack = await pythonPip.provideStack(`test/providers/tst_manifests/pip/${testCase}/requirements.txt`)
			// new(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date

			// providedDataForStack.content = providedDataForStack.content.replaceAll("\"timestamp\":\"[a-zA-Z0-9\\-\\:]+\"","")
			// verify returned data matches expectation
			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'pip',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
		// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 30000 : 10000)

		test(`verify requirements.txt sbom provided for component analysis with scenario ${scenario}`, async () => {
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/pip/${testCase}/expected_component_sbom.json`,).toString().trim()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			// read target manifest file
			let manifestContent = fs.readFileSync(`test/providers/tst_manifests/pip/${testCase}/requirements.txt`).toString()
			// invoke sut stack analysis for scenario manifest
			let providedDatForComponent = await pythonPip.provideComponent(manifestContent)
			// verify returned data matches expectation
			expect(providedDatForComponent).to.deep.equal({
				ecosystem: 'pip',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 15000 : 10000)
	});

	[
		"pip_requirements_virtual_env_txt_no_ignore",
		"pip_requirements_virtual_env_with_ignore"
	].forEach(testCase => {
		let scenario = testCase.replace('pip_requirements_', '').replaceAll('_', ' ')
		test(`verify requirements.txt sbom provided for stack analysis using virutal python environment, with scenario ${scenario}`, async () => {
			// load the expected sbom stack analysis
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/pip/${testCase}/expected_stack_sbom.json`,).toString()
			process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = "true"
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			// invoke sut stack analysis for scenario manifest

			let providedDataForStack = await pythonPip.provideStack(`test/providers/tst_manifests/pip/${testCase}/requirements.txt`)
			// new(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date

			// providedDataForStack.content = providedDataForStack.content.replaceAll("\"timestamp\":\"[a-zA-Z0-9\\-\\:]+\"","")
			// verify returned data matches expectation
			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'pip',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 30000 : 15000)


	})

}).beforeAll(() => clock = sinon.useFakeTimers(new Date('2023-10-01T00:00:00.000Z'))).afterAll(()=> clock.restore());
