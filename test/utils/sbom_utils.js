/**
 * Compares two SBOMs and throws an error if they don't match
 * @param {string|Object} actualSbom - The actual SBOM to compare
 * @param {string|Object} expectedSbom - The expected SBOM to compare against
 * @throws {Error} If the SBOMs don't match, with a descriptive error message
 */
export function compareSboms(actualSbom, expectedSbom) {
	// Parse the SBOMs if they're strings
	const expected = typeof expectedSbom === 'string' ? JSON.parse(expectedSbom) : expectedSbom;
	const actual = typeof actualSbom === 'string' ? JSON.parse(actualSbom) : actualSbom;

	// Helper function to get component names
	const getComponentNames = (components) => components.map(c => c.name).sort();

	// Compare components
	const expectedComponents = getComponentNames(expected.components);
	const actualComponents = getComponentNames(actual.components);

	const missingComponents = expectedComponents.filter(c => !actualComponents.includes(c));
	const extraComponents = actualComponents.filter(c => !expectedComponents.includes(c));

	const componentPropertyDiffs = {};

	// Compare component properties
	expected.components.forEach(expectedComponent => {
		const actualComponent = actual.components.find(c => c.purl === expectedComponent.purl);
		if (actualComponent) {
			// Compare component properties
			const propertyDiffs = [];
			const propertiesToCompare = ['name', 'version', 'bom-ref', 'type', 'group', 'scope'];

			propertiesToCompare.forEach(prop => {
				if (expectedComponent[prop] !== actualComponent[prop]) {
					propertyDiffs.push({
						property: prop,
						expected: expectedComponent[prop],
						actual: actualComponent[prop]
					});
				}
			});

			if (propertyDiffs.length > 0) {
				componentPropertyDiffs[expectedComponent.name] = propertyDiffs;
			}
		}
	});

	// Compare dependencies
	const expectedDeps = expected.dependencies || [];
	const actualDeps = actual.dependencies || [];

	const missingDeps = expectedDeps.filter(ed => !actualDeps.some(ad => ad.ref === ed.ref));
	const extraDeps = actualDeps.filter(ad => !expectedDeps.some(ed => ed.ref === ad.ref));

	const dependencyDiffs = {};

	// Compare dependencies for each component
	expectedDeps.forEach(expectedDep => {
		const actualDep = actualDeps.find(ad => ad.ref === expectedDep.ref);
		if (actualDep) {
			const missingDependsOn = (expectedDep.dependsOn || []).filter(d => !(actualDep.dependsOn || []).includes(d));
			const extraDependsOn = (actualDep.dependsOn || []).filter(d => !(expectedDep.dependsOn || []).includes(d));

			if (missingDependsOn.length > 0 || extraDependsOn.length > 0) {
				dependencyDiffs[expectedDep.ref] = {
					missing: missingDependsOn,
					unexpected: extraDependsOn
				};
			}
		}
	});

	// Perform assertions with meaningful error messages
	if (missingComponents.length > 0) {
		throw new Error(`Missing components in actual SBOM: ${missingComponents.join(', ')}`);
	}
	if (extraComponents.length > 0) {
		throw new Error(`Unexpected components in actual SBOM: ${extraComponents.join(', ')}`);
	}

	Object.entries(componentPropertyDiffs).forEach(([component, diffs]) => {
		const propertyErrors = diffs.map(diff =>
			`Property '${diff.property}' has incorrect value. Expected: ${diff.expected || 'undefined'}, Actual: ${diff.actual || 'undefined'}`
		);
		throw new Error(`Component ${component} has property issues:\n${propertyErrors.join('\n')}`);
	});

	if (missingDeps.length > 0) {
		throw new Error(`Missing dependencies in actual SBOM: ${missingDeps.map(d => d.ref).join(', ')}`);
	}
	if (extraDeps.length > 0) {
		throw new Error(`Unexpected dependencies in actual SBOM: ${extraDeps.map(d => d.ref).join(', ')}`);
	}

	Object.entries(dependencyDiffs).forEach(([ref, diffs]) => {
		if (diffs.missing.length > 0) {
			throw new Error(`Dependency ${ref} is missing dependsOn: ${diffs.missing.join(', ')}`);
		}
		if (diffs.unexpected.length > 0) {
			throw new Error(`Dependency ${ref} has unexpected dependsOn: ${diffs.unexpected.join(', ')}`);
		}
	});

	// Compare metadata
	const actualEcosystem = actual.metadata?.component?.ecosystem;
	const expectedEcosystem = expected.metadata?.component?.ecosystem;
	if (actualEcosystem !== expectedEcosystem) {
		throw new Error(`Ecosystem mismatch. Expected: ${expectedEcosystem}, Actual: ${actualEcosystem}`);
	}

	const actualContentType = actual.metadata?.component?.contentType;
	const expectedContentType = expected.metadata?.component?.contentType;
	if (actualContentType !== expectedContentType) {
		throw new Error(`Content type mismatch. Expected: ${expectedContentType}, Actual: ${actualContentType}`);
	}
}
