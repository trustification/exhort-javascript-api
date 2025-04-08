import fs from "node:fs";
// import {AnalysisReport} from '../../generated/backend/AnalysisReport.js'
import index from "../../src/index.js"
import { expect } from 'chai'
// import fs from 'node:fs'

function getManifestNamePerPm(packageManager) {
	return packageManagersDict[packageManager];
}

const packageManagersDict =
	{
		"maven" : "pom.xml",
		"npm" : "package.json",
		"go" : "go.mod",
		"pip" : "requirements.txt",
		"gradle-groovy" : "build.gradle",
		"gradle-kotlin" : "build.gradle.kts"
	}

function getParsedKeyFromHtml(html, key,keyLength) {
	let beginSummary = html.substring(html.indexOf(key))
	let summary = beginSummary.substring(keyLength , beginSummary.indexOf("}") + 1);
	return JSON.parse(summary);
}

function extractTotalsGeneralOrFromProvider(providedDataForStack, provider) {
	if(providedDataForStack.providers[provider].sources.length > 0) {
		return providedDataForStack.providers[provider].sources[provider].summary.total;
	}
	else {
		return providedDataForStack.scanned.total;
	}
}

suite('Integration Tests', () => {
	// let opts = {
	// 	EXHORT_DEV_MODE: "true",
	//
	// }
	[
		"gradle-groovy",
		"gradle-kotlin",
		"maven",
		"npm",
		"go",
		"pip"

	].forEach(packageManager => {
		test(`Stack Analysis json for ${packageManager}`, async () => {
			// process.env["EXHORT_DEBUG"]= "true"
			// process.env["EXHORT_DEV_MODE"]= "false"
			// process.env["EXHORT_GO_PATH"]= "/home/zgrinber/test-go/go/bin/go"
			// process.env["RHDA_TOKEN"] = "34JKLDS-4234809-66666666666"
			// process.env["RHDA_SOURCE"] = "Zvika Client"
			// let result = await index.stackAnalysis("/tmp/rajan-0410/go.mod", false, opts);
			if(packageManager === "pip")
			{
				process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = "true"
			}
			else
			{
				process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = ""
			}
			process.env["EXHORT_DEV_MODE"] = "true"
			let manifestName = getManifestNamePerPm(packageManager)
			let pomPath = `test/it/test_manifests/${packageManager}/${manifestName}`
			let providedDataForStack = await index.stackAnalysis(pomPath)
			console.log(JSON.stringify(providedDataForStack,null , 4))
			let providers = ["osv"]
			providers.forEach(provider => expect(extractTotalsGeneralOrFromProvider(providedDataForStack, provider)).greaterThan(0))
			//TO DO - if sources doesn't exists, add "scanned" instead
			// python transitive count for stack analysis is awaiting fix in exhort backend
			if(packageManager !== "pip")
			{
				expect(providedDataForStack.scanned.transitive).greaterThan(0)
			}
			providers.forEach(provider => expect(providedDataForStack.providers[provider].status.code).equals(200))
		}).timeout(120000);

		test(`Stack Analysis html for ${packageManager}`, async () => {

			let manifestName = getManifestNamePerPm(packageManager)
			let pomPath = `test/it/test_manifests/${packageManager}/${manifestName}`
			let html = await index.stackAnalysis(pomPath,true)
			if(packageManager === "pip")
			{
				process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = "true"
			}
			else
			{
				process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = ""
			}
			let reportParsedFromHtml
			let parsedSummaryFromHtml
			let parsedStatusFromHtmlOsvNvd
			let parsedScannedFromHtml
			try {
				reportParsedFromHtml = JSON.parse(html.substring(html.indexOf("\"report\" :") + 10, html.search(/([}](\s*)){5}/) + html.substring(html.search(/([}](\s*)){5}/)).indexOf(",")))
				parsedSummaryFromHtml = getParsedKeyFromHtml(html,"\"summary\"",11)
				expect(parsedSummaryFromHtml.total).greaterThanOrEqual(0)
			} catch (e) {
				let startOfJson = html.substring(html.indexOf("\"report\" :"))
				reportParsedFromHtml = JSON.parse("{" + startOfJson.substring(0,startOfJson.indexOf("};") + 1))
				reportParsedFromHtml = reportParsedFromHtml.report
			}
			finally
			{
				parsedStatusFromHtmlOsvNvd = reportParsedFromHtml.providers["osv"].status
				expect(parsedStatusFromHtmlOsvNvd.code).equals(200)
				parsedScannedFromHtml = reportParsedFromHtml.scanned
				expect( typeof html).equals("string")
				expect(html).include("html").include("svg")
				expect(parsedScannedFromHtml.total).greaterThan(0)
				expect(parsedScannedFromHtml.transitive).greaterThan(0)
			}
		}).timeout(60000);

		test(`Component Analysis for ${packageManager}`, async () => {
			let manifestName = getManifestNamePerPm(packageManager)
			let manifestPath = `test/it/test_manifests/${packageManager}/${manifestName}`
			let analysisReport;
			// gradle is the only package manager the supports only path for component analysis.
			if(packageManager.startsWith('gradle')) {
				analysisReport = await index.componentAnalysis(manifestName,"",{},manifestPath)
			}
			else {
				analysisReport = await index.componentAnalysis(manifestName, fs.readFileSync(manifestPath).toString());
			}

			expect(analysisReport.scanned.total).greaterThan(0)
			expect(analysisReport.scanned.transitive).equal(0)
			let providers = ["osv"]
			providers.forEach(provider => expect(extractTotalsGeneralOrFromProvider(analysisReport,provider)).greaterThan(0))
			providers.forEach(provider => expect(analysisReport.providers[provider].status.code).equals(200))
		}).timeout(20000);


	});
}).beforeAll(() => process.env["EXHORT_DEV_MODE"] = "true");

// suite('Integration Tests - Developer Test End to End', () => {
// let opts = {
// 	EXHORT_DEV_MODE: "true",
//
// }
//
// 	test(`Stack Analysis json`, async () => {
// 		process.env["EXHORT_DEBUG"]= "true"
// 		process.env["EXHORT_DEV_MODE"]= "true"
// 		// process.env["EXHORT_GO_PATH"]= "/home/zgrinber/test-go/go/bin/go"
// 		// process.env["RHDA_TOKEN"] = "34JKLDS-4234809-66666666666"
// 		// process.env["RHDA_SOURCE"] = "Zvika Client"
// 		// let result = await index.stackAnalysis("/tmp/rajan-0410/go.mod", false, opts);
// 		let opts = {
// 			MATCH_MANIFEST_VERSIONS: 'false',
// 			EXHORT_DEV_MODE: 'true',
// 			// EXHORT_OSS_INDEX_TOKEN: '2bb579b7894f13f180f0ebb591be7c8febbcf699',
// 			EXHORT_OSS_INDEX_USER: 'zgrinber@redhat.com',
// 			EXHORT_GO_MVS_LOGIC_ENABLED: 'true'
// 		}
// 		process.env["EXHORT_PYTHON_VIRTUAL_ENV"] = "true"
// 		process.env["EXHORT_PYTHON_INSTALL_BEST_EFFORTS"] = "true"
// 		process.env["MATCH_MANIFEST_VERSIONS"] = "false"
// 		// let pomPath = `/tmp/070324/package.json`
// 		let pomPath = `/tmp/170324/requirements.txt`
// 		// let pomPath = `/home/zgrinber/git/tracing-demos-and-examples/tracing-parent/pom.xml`
// 		let providedDataForStack;
// 		// providedDataForStack = await index.componentAnalysis("requirements.txt", fs.readFileSync(pomPath).toString(),{},pomPath);
// 		providedDataForStack = await index.stackAnalysis(pomPath);
// 		// console.log(JSON.stringify(providedDataForStack,null , 4))
// 		// fs.writeFileSync(`/tmp/301123/report.html`,providedDataForStack)
//
// 		// expect(providedDataForStack.summary.dependencies.scanned).greaterThan(0)
// 	}).timeout(15000);
//
//
//
//
// });
