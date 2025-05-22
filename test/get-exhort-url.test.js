import { expect } from 'chai'

import {exhortDefaultUrl, exhortDevDefaultUrl, testSelectExhortBackend} from "../src/index.js"

suite('testing Select Exhort Backend function when EXHORT_DEV_MODE environment variable is True', () => {

	test('When Dev Mode environment Variable= true, default DEV Exhort Backend Selected ', () => {
		let testOpts = {
			"EXHORT_DEV_MODE" : "true"

		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDefaultUrl)
		expect(selectedUrl).to.be.equals(exhortDevDefaultUrl)
	});

	test('When Dev Mode environment Variable= true, and despite option Dev Mode = false  , default DEV Exhort Backend Selected ', () => {
		let testOpts = {
			"EXHORT_DEV_MODE" : "false"
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDefaultUrl)
		expect(selectedUrl).to.be.equals(exhortDevDefaultUrl)
	});

	test('When Dev Mode environment Variable= true, And option DEV_EXHORT_BACKEND_URL contains some url route that client set , default DEV Exhort Backend Not Selected ', () => {
		const dummyRoute = "http://dummy-exhort-route";
		let testOpts = {
			"DEV_EXHORT_BACKEND_URL" : dummyRoute
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDevDefaultUrl)
		expect(selectedUrl).to.be.equals(dummyRoute)
	});

}).beforeAll(() => process.env["EXHORT_DEV_MODE"] = "true" ).afterAll(() => delete process.env['EXHORT_DEV_MODE']);

suite('testing Select Exhort Backend function when EXHORT_DEV_MODE environment variable is false', () => {

	test('When Dev Mode environment Variable= true, default DEV Exhort Backend Selected ', () => {

		let testOpts = {
			"EXHORT_DEV_MODE" : "false"
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDevDefaultUrl)
		expect(selectedUrl).to.be.equals(exhortDefaultUrl)
	});

	test('When Dev Mode environment Variable= false, and despite option Dev Mode = true  , default Exhort Backend Selected (production) ', () => {
		let dummyRoute = "http://dummy-dev-route-exhirt"
		let testOpts = {
			"EXHORT_DEV_MODE" : "true",
			"DEV_EXHORT_BACKEND_URL" : dummyRoute
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(dummyRoute)
		expect(selectedUrl).to.be.equals(exhortDefaultUrl)
	});

	test('When Dev Mode environment Variable= false, environment variable DEV_EXHORT_BACKEND_URL=dummy-url , option EXHORT_DEV_MODE=true   , default Exhort Backend Selected anyway ', () => {
		const dummyRoute = "http://dummy-url"
		process.env["DEV_EXHORT_BACKEND_URL"] = dummyRoute
		let testOpts = {
			"EXHORT_DEV_MODE" : "true",
			"DEV_EXHORT_BACKEND_URL" : dummyRoute
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		delete process.env["DEV_EXHORT_BACKEND_URL"]
		expect(selectedUrl).not.to.be.equals(dummyRoute)
		expect(selectedUrl).to.be.equals(exhortDefaultUrl)
	});

}).beforeAll(() => process.env["EXHORT_DEV_MODE"] = "false" ).afterAll(() => delete process.env['EXHORT_DEV_MODE']);

suite('testing Select Exhort Backend function when EXHORT_DEV_MODE environment variable is not set', () => {

	test('When Dev Mode Option = false, default Exhort Backend Selected (production)', () => {

		let testOpts = {
			"EXHORT_DEV_MODE" : "false"
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDevDefaultUrl)
		expect(selectedUrl).to.be.equals(exhortDefaultUrl)
	});

	test('When Dev Mode Option Variable= true, default dev Exhort Backend Selected ', () => {
		let testOpts = {
			"EXHORT_DEV_MODE" : "true"
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDefaultUrl)
		expect(selectedUrl).to.be.equals(exhortDevDefaultUrl)
	});

	test('When Dev Mode option = true, option DEV_EXHORT_BACKEND_URL=some dummy-url , then some dummy-url Selected  ', () => {
		let dummyRoute = "http://dummy-dev-route-exhirt"
		process.env["DEV_EXHORT_BACKEND_URL"] = dummyRoute
		let testOpts = {
			"EXHORT_DEV_MODE" : "true",
			"DEV_EXHORT_BACKEND_URL" : dummyRoute
		}
		let selectedUrl = testSelectExhortBackend(testOpts);
		expect(selectedUrl).not.to.be.equals(exhortDefaultUrl)
		expect(selectedUrl).to.be.equals(dummyRoute)
		delete process.env["DEV_EXHORT_BACKEND_URL"]
	});

	test('When Nothing set, Choose default backend (production) ', () => {
		let selectedUrl = testSelectExhortBackend({});
		expect(selectedUrl).to.be.equals(exhortDefaultUrl)
	});


});

