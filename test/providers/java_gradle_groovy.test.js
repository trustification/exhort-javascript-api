import { expect } from 'chai'
import fs from 'fs'
import sinon from "sinon";
import Java_gradle_groovy from '../../src/providers/java_gradle_groovy.js'

let clock

/** this function is parsing the outputfile path from the given command, and write that file the providerContent supplied.
 *
 * @param {Array<string>}args - the args passed to the binary
 * @param {string}providerContent - the content of the mocked data to replace original content in intercepted temp file
 * @param {string} outputFileParameter - name of the parameter indicating the output file of the command invocation, including '='.
 * @private
 */

function getStubbedResponse(args, dependencyTreeTextContent, gradleProperties) {
	if (args.includes("dependencies")) {
		return dependencyTreeTextContent
	} else if (args.includes("properties")) {
		return gradleProperties
	}
	return ''
}

suite('testing the java-gradle-groovy data provider', () => {

	[
		{name: 'build.gradle', expected: true},
		{name: 'some_other.file', expected: false}
	].forEach(testCase => {
		test(`verify isSupported returns ${testCase.expected} for ${testCase.name}`, () => {
			let javaGradleProvider = new Java_gradle_groovy()
			expect(javaGradleProvider.isSupported(testCase.name)).to.equal(testCase.expected)
		})
	});

	[
		"deps_with_no_ignore_common_paths",
		"deps_with_ignore_full_specification",
		"deps_with_ignore_named_params",
		"deps_with_ignore_notations"
	].forEach(testCase => {
		let scenario = testCase.replaceAll('_', ' ')

		test(`verify gradle data provided for stack analysis with scenario ${scenario}`, async () => {
			// load the expected graph for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/expected_stack_sbom.json`,).toString().trim()
			let dependencyTreeTextContent = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/depTree.txt`,).toString()
			let gradleProperties = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/gradle.properties`,).toString()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom),null, 4)
			let mockedExecFunction = function(bin, args){
				return getStubbedResponse(args, dependencyTreeTextContent, gradleProperties);
			}
			let javGradleProvider = new Java_gradle_groovy()
			Object.getPrototypeOf(Object.getPrototypeOf(javGradleProvider))._invokeCommand = mockedExecFunction
			// invoke sut stack analysis for scenario manifest
			let providedDataForStack =  javGradleProvider.provideStack(`test/providers/tst_manifests/gradle/${testCase}/build.gradle`)
			// verify returned data matches expectation
			// expect(providedDataForStack).to.deep.equal({
			// 	ecosystem: 'gradle',
			// 	contentType: 'application/vnd.cyclonedx+json',
			// 	content: expectedSbom
			//		})
			let beautifiedOutput = JSON.stringify(JSON.parse(providedDataForStack.content),null, 4);
			expect(beautifiedOutput).to.deep.equal(expectedSbom)

		// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 40000 : 10000)

		test(`verify gradle data provided for component analysis with scenario ${scenario}`, async () => {
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/expected_component_sbom.json`,).toString().trim()
			// read target manifest file
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom),null, 4)
			let dependencyTreeTextContent = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/depTree.txt`,).toString()
			let gradleProperties = fs.readFileSync(`test/providers/tst_manifests/gradle/${testCase}/gradle.properties`,).toString()
			let mockedExecFunction = function(bin, args){
				return getStubbedResponse(args, dependencyTreeTextContent, gradleProperties);
			}
			let javaGradleProvider = new Java_gradle_groovy()
			Object.getPrototypeOf(Object.getPrototypeOf(javaGradleProvider))._invokeCommand = mockedExecFunction
			// invoke sut component analysis for scenario manifest
			let provdidedForComponent = javaGradleProvider.provideComponent("",{},`test/providers/tst_manifests/gradle/${testCase}/build.gradle`)
			// verify returned data matches expectation
			let beautifiedOutput = JSON.stringify(JSON.parse(provdidedForComponent.content),null, 4);
			expect(beautifiedOutput).to.deep.equal(expectedSbom)
			// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 15000 : 5000)
		// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)

	})
}).beforeAll(() => clock = sinon.useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(()=> {clock.restore()});

