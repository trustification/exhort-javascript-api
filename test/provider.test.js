import { expect } from 'chai'
import { match } from "../src/provider.js"

suite('testing the provider utility function', () => {
	// create a dummy provider for 'dummy_file.typ'
	let dummyProvider = {
		isSupported: nameType => 'dummy_file.typ' === nameType,
		requireLockFile: () => false,
		getLockFileName: () => undefined, // not required for this test
		provideComponent: () => {}, // not required for this test
		provideStack: () => {} // not required for this test
	}

	test('when found matching provider should should return it', () => {
		let provider = match('/path/to/dummy_file.typ', [dummyProvider])
		expect(provider).to.be.equal(dummyProvider)
	});

	test('when no provider matched should throw error', () => {
		expect(() => match('/path/to/unknown.manifest', [dummyProvider]))
			.to.throw('unknown.manifest is not supported')
	})
});
