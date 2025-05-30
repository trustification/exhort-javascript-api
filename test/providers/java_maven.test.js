import fs from 'fs'
import path from 'path';

import { expect } from 'chai'
import esmock from 'esmock';
import { useFakeTimers } from "sinon";

import Java_maven from '../../src/providers/java_maven.js'



let clock

async function mockProvider(cwd) {

	const mockInvokeCommand = () => {
		return '';
	};

	const mockGitRootDir = (cwd) => {
		return cwd;
	}

	const mockFs = {
		mkdtempSync: (pathName) => pathName,
		readFileSync: (filePath) => {
			const output = path.join(cwd, path.basename(filePath));
			return fs.readFileSync(output);
		},
		rmSync: () => {}
	}

	return esmock('../../src/providers/java_maven.js', {
		fs: mockFs,
		'../../src/providers/base_java.js': await esmock('../../src/providers/base_java.js', {
			'../../src/tools.js': {
				invokeCommand: mockInvokeCommand,
				getGitRootDir: mockGitRootDir
			}
		})
	});
}

async function createMockProvider(testPath) {
	const Java_maven = await mockProvider(testPath);
	return new Java_maven();
}

suite('testing the java-maven data provider', () => {

	[
		{name: 'pom.xml', expected: true},
		{name: 'some_other.file', expected: false}
	].forEach(testCase => {
		test(`verify isSupported returns ${testCase.expected} for ${testCase.name}`, () => {
			let javaMvnProvider = new Java_maven()
			expect(javaMvnProvider.isSupported(testCase.name)).to.equal(testCase.expected)
		})
	});

	[
		"poms_deps_with_2_ignore_long",
		"pom_deps_with_ignore_on_artifact",
		"pom_deps_with_ignore_on_dependency",
		"pom_deps_with_ignore_on_group",
		"pom_deps_with_ignore_on_version",
		"pom_deps_with_ignore_version_from_property",
		"pom_deps_with_ignore_on_wrong",
		"pom_deps_with_no_ignore",
		"poms_deps_with_ignore_long",
		"poms_deps_with_no_ignore_long",
		"pom_deps_with_no_ignore_common_paths"
	].forEach(testCase => {
		let scenario = testCase.replace('pom_deps_', '').replaceAll('_', ' ')

		test(`verify maven data provided for stack analysis with scenario ${scenario}`, async () => {
			// load the expected graph for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/maven/${testCase}/stack_analysis_expected_sbom.json`,).toString().trim()
			// let dependencyTreeTextContent = fs.readFileSync(`test/providers/tst_manifests/maven/${testCase}/dep-tree.txt`,).toString()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom),null, 4)
			let javaMvnProvider = await createMockProvider(`test/providers/tst_manifests/maven/${testCase}`);
			// invoke sut stack analysis for scenario manifest
			let providedDataForStack =  javaMvnProvider.provideStack(`test/providers/tst_manifests/maven/${testCase}/pom.xml`)
			// verify returned data matches expectation
			let beautifiedOutput = JSON.stringify(JSON.parse(providedDataForStack.content),null, 4);
			expect(beautifiedOutput).to.deep.equal(expectedSbom)

		// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 40000 : 10000)

		test(`verify maven data provided for component analysis with scenario ${scenario}`, async () => {
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/maven/${testCase}/component_analysis_expected_sbom.json`,).toString().trim()
			// read target manifest file
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			let javaMvnProvider = await createMockProvider(`test/providers/tst_manifests/maven/${testCase}`);
			// invoke sut component analysis for scenario manifest
			let providedDataForStack = javaMvnProvider.provideComponent(`test/providers/tst_manifests/maven/${testCase}/pom.xml`)
			// verify returned data matches expectation
			expect(providedDataForStack).to.deep.equal({
				ecosystem: 'maven',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 15000 : 5000)
		// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)

	})
}).beforeAll(() => clock = useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(()=> {clock.restore()});

suite('testing the java-maven data provider with modules', () => {
	[
		"pom_with_one_module",
		"pom_with_multiple_modules"

	].forEach(testCase => {
		let scenario = testCase.replaceAll('_', ' ')
		test(`verify maven data provided for component analysis using path for scenario ${scenario}`, async () => {
			// load the expected list for the scenario
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/maven/${testCase}/component_analysis_expected_sbom.json`,).toString().trim()
			// read target manifest file
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom))
			let javaMvnProvider = await createMockProvider(`test/providers/tst_manifests/maven/${testCase}`);
			// invoke sut component analysis for scenario manifest
			let provideDataForComponent = javaMvnProvider.provideComponent(`test/providers/tst_manifests/maven/${testCase}/pom.xml`, {})
			// verify returned data matches expectation
			expect(provideDataForComponent).to.deep.equal({
				ecosystem: 'maven',
				contentType: 'application/vnd.cyclonedx+json',
				content: expectedSbom
			})
			// these test cases takes ~2500-2700 ms each pr >10000 in CI (for the first test-case)
		}).timeout(process.env.GITHUB_ACTIONS ? 40000 : 10000)

		// these test cases takes ~1400-2000 ms each pr >10000 in CI (for the first test-case)

	})
}).beforeAll(() => clock = useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(()=> {clock.restore()});
