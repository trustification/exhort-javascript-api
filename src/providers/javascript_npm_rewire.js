import { execSync } from "node:child_process";
import fs from 'node:fs';
import os from "node:os";
import { getCustomPath, handleSpacesInPath } from "../tools.js";
import path from 'node:path';
import Sbom from '../sbom.js';
import { PackageURL } from 'packageurl-js';
export var npmInteractions = {
  listing: function runNpmListing(npmListing) {
    let npmOutput = _get__("execSync")(npmListing, err => {
      if (err) {
        throw new Error('failed to get npmOutput json from npm');
      }
    });
    return npmOutput;
  },
  version: function checkNpmVersion(npm) {
    _get__("execSync")(`${_get__("handleSpacesInPath")(npm)} --version`, err => {
      if (err) {
        throw new Error('npm is not accessible');
      }
    });
  },
  createPackageLock: function createPackageLock(npm, manifestDir) {
    // in windows os, --prefix flag doesn't work, it behaves really weird , instead of installing the package.json fromm the prefix folder,
    // it's installing package.json (placed in current working directory of process) into prefix directory, so
    let originalDir = process.cwd();
    if (_get__("os").platform() === 'win32') {
      process.chdir(manifestDir);
    }
    _get__("execSync")(`${_get__("handleSpacesInPath")(npm)} i --package-lock-only --prefix ${_get__("handleSpacesInPath")(manifestDir)}`, err => {
      if (err) {
        throw new Error('failed to create npmOutput list');
      }
    });
    if (_get__("os").platform() === 'win32') {
      process.chdir(originalDir);
    }
  }
};
let _DefaultExportValue = {
  isSupported: _get__("isSupported"),
  validateLockFile: _get__("validateLockFile"),
  provideComponent: _get__("provideComponent"),
  provideStack: _get__("provideStack"),
  npmInteractions: _get__("npmInteractions")
};
export default _DefaultExportValue;
/** @typedef {import('../provider').Provider} */
/** @typedef {import('../provider').Provided} Provided */
/** @typedef {{name: string, version: string}} Package */
/** @typedef {{groupId: string, artifactId: string, version: string, scope: string, ignore: boolean}} Dependency */
/**
 * @type {string} ecosystem for npm-npm is 'maven'
 * @private
 */
const ecosystem = 'npm';
const defaultVersion = 'v0.0.0';

/**
 * @param {string} manifestName - the subject manifest name-type
 * @returns {boolean} - return true if `pom.xml` is the manifest name-type
 */
function isSupported(manifestName) {
  return 'package.json' === manifestName;
}

/**
 * @param {string} manifestDir - the directory where the manifest lies
 */
function validateLockFile(manifestDir) {
  const lockFileName = ["package-lock.json"].find(expectedLockFileName => {
    const lock = _get__("path").join(manifestDir, expectedLockFileName);
    return _get__("fs").existsSync(lock);
  });
  if (!lockFileName) {
    throw new Error("Lock file does not exists or is not supported.");
  }
}

/**
 * Provide content and content type for maven-maven stack analysis.
 * @param {string} manifest - the manifest path or name
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideStack(manifest, opts = {}) {
  return {
    ecosystem: _get__("ecosystem"),
    content: _get__("getSBOM")(manifest, opts, true),
    contentType: 'application/vnd.cyclonedx+json'
  };
}
function getComponent(data, opts, manifestPath) {
  let sbom;
  if (manifestPath.trim() === '') {
    let tmpDir = _get__("fs").mkdtempSync(_get__("path").join(_get__("os").tmpdir(), 'exhort_'));
    let tmpPackageJson = _get__("path").join(tmpDir, 'package.json');
    _get__("fs").writeFileSync(tmpPackageJson, data);
    sbom = _get__("getSBOM")(tmpPackageJson, opts, false);
    _get__("fs").rmSync(tmpDir, {
      recursive: true,
      force: true
    });
  } else {
    sbom = _get__("getSBOM")(manifestPath, opts, false);
  }
  return sbom;
}

/**
 * Provide content and content type for maven-maven component analysis.
 * @param {string} data - content of pom.xml for component report
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {Provided}
 */
function provideComponent(data, opts = {}, path = '') {
  return {
    ecosystem: _get__("ecosystem"),
    content: _get__("getComponent")(data, opts, path),
    contentType: 'application/vnd.cyclonedx+json'
  };
}

/**
 *
 * @param {string} npm the npm binary path
 * @param {string }allFilter can be "-all" ( for stack analysis) or empty string ( for component analysis).
 * @param {string} manifestDir path to manifest' directory.
 * @return {string} returns a string containing the result output.
 */
function getNpmListing(npm, allFilter, manifestDir) {
  return `${_get__("handleSpacesInPath")(npm)} ls${allFilter} --omit=dev --package-lock-only --json --prefix ${manifestDir}`;
}

/**
 * Create SBOM json string for npm Package.
 * @param {string} manifest - path for package.json
 * @param {{}} [opts={}] - optional various options to pass along the application
 * @returns {string} the SBOM json content
 * @private
 */
function getSBOM(manifest, opts = {}, includeTransitive) {
  // get custom npm path
  let npm = _get__("getCustomPath")('npm', opts);
  // verify npm is accessible
  _get__("npmInteractions").version(npm);
  let manifestDir = _get__("path").dirname(manifest);
  _get__("npmInteractions").createPackageLock(npm, manifestDir);
  let allFilter = includeTransitive ? " --all" : "";
  let npmListing = _get__("getNpmListing")(npm, allFilter, _get__("handleSpacesInPath")(manifestDir));
  let npmOutput = _get__("npmInteractions").listing(npmListing);
  let depsObject = JSON.parse(npmOutput);
  let rootName = depsObject["name"];
  let rootVersion = depsObject["version"];
  if (!rootVersion) {
    rootVersion = _get__("defaultVersion");
  }
  let mainComponent = _get__("toPurl")(rootName, rootVersion);
  let sbom = new (_get__("Sbom"))();
  sbom.addRoot(mainComponent);
  let dependencies = depsObject["dependencies"];
  _get__("addAllDependencies")(sbom, sbom.getRoot(), dependencies);
  let packageJson = _get__("fs").readFileSync(manifest).toString();
  let packageJsonObject = JSON.parse(packageJson);
  if (packageJsonObject.exhortignore !== undefined) {
    let ignoredDeps = Array.from(packageJsonObject.exhortignore);
    sbom.filterIgnoredDeps(ignoredDeps);
  }
  return sbom.getAsJsonString(opts);
}

/**
 * Utility function for creating Purl String

 * @param name the name of the artifact, can include a namespace(group) or not - namespace/artifactName.
 * @param version the version of the artifact
 * @private
 * @returns {PackageURL|null} PackageUrl Object ready to be used in SBOM
 */
function toPurl(name, version) {
  let parts = name.split("/");
  var pkg;
  if (parts.length === 2) {
    pkg = new (_get__("PackageURL"))('npm', parts[0], parts[1], version, undefined, undefined);
  } else {
    pkg = new (_get__("PackageURL"))('npm', undefined, parts[0], version, undefined, undefined);
  }
  return pkg;
}

/**
 * This function recursively build the Sbom from the JSON that npm listing returns
 * @param sbom this is the sbom object
 * @param from this is the current component in bom (Should start with root/main component of SBOM) for which we want to add all its dependencies.
 * @param dependencies the current dependency list (initially it's the list of the root component)
 * @private
 */
function addAllDependencies(sbom, from, dependencies) {
  Object.entries(dependencies).filter(entry => entry[1].version !== undefined).forEach(entry => {
    let name, artifact;
    [name, artifact] = entry;
    let purl = _get__("toPurl")(name, artifact.version);
    sbom.addDependency(from, purl);
    let transitiveDeps = artifact.dependencies;
    if (transitiveDeps !== undefined) {
      _get__("addAllDependencies")(sbom, sbom.purlToComponent(purl), transitiveDeps);
    }
  });
}
function _getGlobalObject() {
  try {
    if (!!global) {
      return global;
    }
  } catch (e) {
    try {
      if (!!window) {
        return window;
      }
    } catch (e) {
      return this;
    }
  }
}
;
var _RewireModuleId__ = null;
function _getRewireModuleId__() {
  if (_RewireModuleId__ === null) {
    let globalVariable = _getGlobalObject();
    if (!globalVariable.__$$GLOBAL_REWIRE_NEXT_MODULE_ID__) {
      globalVariable.__$$GLOBAL_REWIRE_NEXT_MODULE_ID__ = 0;
    }
    _RewireModuleId__ = __$$GLOBAL_REWIRE_NEXT_MODULE_ID__++;
  }
  return _RewireModuleId__;
}
function _getRewireRegistry__() {
  let theGlobalVariable = _getGlobalObject();
  if (!theGlobalVariable.__$$GLOBAL_REWIRE_REGISTRY__) {
    theGlobalVariable.__$$GLOBAL_REWIRE_REGISTRY__ = Object.create(null);
  }
  return theGlobalVariable.__$$GLOBAL_REWIRE_REGISTRY__;
}
function _getRewiredData__() {
  let moduleId = _getRewireModuleId__();
  let registry = _getRewireRegistry__();
  let rewireData = registry[moduleId];
  if (!rewireData) {
    registry[moduleId] = Object.create(null);
    rewireData = registry[moduleId];
  }
  return rewireData;
}
(function registerResetAll() {
  let theGlobalVariable = _getGlobalObject();
  if (!theGlobalVariable['__rewire_reset_all__']) {
    theGlobalVariable['__rewire_reset_all__'] = function () {
      theGlobalVariable.__$$GLOBAL_REWIRE_REGISTRY__ = Object.create(null);
    };
  }
})();
var INTENTIONAL_UNDEFINED = '__INTENTIONAL_UNDEFINED__';
let _RewireAPI__ = {};
(function () {
  function addPropertyToAPIObject(name, value) {
    Object.defineProperty(_RewireAPI__, name, {
      value: value,
      enumerable: false,
      configurable: true
    });
  }
  addPropertyToAPIObject('__get__', _get__);
  addPropertyToAPIObject('__GetDependency__', _get__);
  addPropertyToAPIObject('__Rewire__', _set__);
  addPropertyToAPIObject('__set__', _set__);
  addPropertyToAPIObject('__reset__', _reset__);
  addPropertyToAPIObject('__ResetDependency__', _reset__);
  addPropertyToAPIObject('__with__', _with__);
})();
function _get__(variableName) {
  let rewireData = _getRewiredData__();
  if (rewireData[variableName] === undefined) {
    return _get_original__(variableName);
  } else {
    var value = rewireData[variableName];
    if (value === INTENTIONAL_UNDEFINED) {
      return undefined;
    } else {
      return value;
    }
  }
}
function _get_original__(variableName) {
  switch (variableName) {
    case "execSync":
      return execSync;
    case "handleSpacesInPath":
      return handleSpacesInPath;
    case "os":
      return os;
    case "path":
      return path;
    case "fs":
      return fs;
    case "ecosystem":
      return ecosystem;
    case "getSBOM":
      return getSBOM;
    case "getComponent":
      return getComponent;
    case "getCustomPath":
      return getCustomPath;
    case "npmInteractions":
      return npmInteractions;
    case "getNpmListing":
      return getNpmListing;
    case "defaultVersion":
      return defaultVersion;
    case "toPurl":
      return toPurl;
    case "Sbom":
      return Sbom;
    case "addAllDependencies":
      return addAllDependencies;
    case "PackageURL":
      return PackageURL;
    case "isSupported":
      return isSupported;
    case "validateLockFile":
      return validateLockFile;
    case "provideComponent":
      return provideComponent;
    case "provideStack":
      return provideStack;
  }
  return undefined;
}
function _assign__(variableName, value) {
  let rewireData = _getRewiredData__();
  if (rewireData[variableName] === undefined) {
    return _set_original__(variableName, value);
  } else {
    return rewireData[variableName] = value;
  }
}
function _set_original__(variableName, _value) {
  switch (variableName) {}
  return undefined;
}
function _update_operation__(operation, variableName, prefix) {
  var oldValue = _get__(variableName);
  var newValue = operation === '++' ? oldValue + 1 : oldValue - 1;
  _assign__(variableName, newValue);
  return prefix ? newValue : oldValue;
}
function _set__(variableName, value) {
  let rewireData = _getRewiredData__();
  if (typeof variableName === 'object') {
    Object.keys(variableName).forEach(function (name) {
      rewireData[name] = variableName[name];
    });
    return function () {
      Object.keys(variableName).forEach(function (name) {
        _reset__(variableName);
      });
    };
  } else {
    if (value === undefined) {
      rewireData[variableName] = INTENTIONAL_UNDEFINED;
    } else {
      rewireData[variableName] = value;
    }
    return function () {
      _reset__(variableName);
    };
  }
}
function _reset__(variableName) {
  let rewireData = _getRewiredData__();
  delete rewireData[variableName];
  if (Object.keys(rewireData).length == 0) {
    delete _getRewireRegistry__()[_getRewireModuleId__];
  }
  ;
}
function _with__(object) {
  let rewireData = _getRewiredData__();
  var rewiredVariableNames = Object.keys(object);
  var previousValues = {};
  function reset() {
    rewiredVariableNames.forEach(function (variableName) {
      rewireData[variableName] = previousValues[variableName];
    });
  }
  return function (callback) {
    rewiredVariableNames.forEach(function (variableName) {
      previousValues[variableName] = rewireData[variableName];
      rewireData[variableName] = object[variableName];
    });
    let result = callback();
    if (!!result && typeof result.then == 'function') {
      result.then(reset).catch(reset);
    } else {
      reset();
    }
    return result;
  };
}
let _typeOfOriginalExport = typeof _DefaultExportValue;
function addNonEnumerableProperty(name, value) {
  Object.defineProperty(_DefaultExportValue, name, {
    value: value,
    enumerable: false,
    configurable: true
  });
}
if ((_typeOfOriginalExport === 'object' || _typeOfOriginalExport === 'function') && Object.isExtensible(_DefaultExportValue)) {
  addNonEnumerableProperty('__get__', _get__);
  addNonEnumerableProperty('__GetDependency__', _get__);
  addNonEnumerableProperty('__Rewire__', _set__);
  addNonEnumerableProperty('__set__', _set__);
  addNonEnumerableProperty('__reset__', _reset__);
  addNonEnumerableProperty('__ResetDependency__', _reset__);
  addNonEnumerableProperty('__with__', _with__);
  addNonEnumerableProperty('__RewireAPI__', _RewireAPI__);
}
export { _get__ as __get__, _get__ as __GetDependency__, _set__ as __Rewire__, _set__ as __set__, _reset__ as __ResetDependency__, _RewireAPI__ as __RewireAPI__ };