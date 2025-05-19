import { expect } from "chai";
import fs from 'fs';
import sinon from 'sinon'
import { generateImageSBOM, parseImageRef } from '../../src/oci_image/utils.js';

let clock;
suite('testing the OCI image data provider', () => {
	[
		"httpd@sha256:4b5cb7697fea2aa6d398504c381b693a54ae9ad5e6317fcdbb7a2d9b8c3b1364",
		"httpd:2.4.49",
		"httpd:2.4.49^^amd64"
	].forEach(imageRef => {
		test(`verify OCI image sbom provided with scenario ${imageRef}`, () => {
			let expectedSbom = fs.readFileSync(`test/providers/tst_manifests/image/${imageRef}.json`).toString().trim()
			expectedSbom = JSON.stringify(JSON.parse(expectedSbom), null, 4)

			let providedSbom = generateImageSBOM(parseImageRef(imageRef))
			providedSbom['metadata'] = null
			providedSbom['serialNumber'] = null
			expect(JSON.stringify(providedSbom, null, 4).trimEnd()).to.deep.equal(expectedSbom)
		}).timeout(10000)
	})
}).beforeAll(() => clock = sinon.useFakeTimers(new Date('2023-08-07T00:00:00.000Z'))).afterAll(()=> clock.restore());
