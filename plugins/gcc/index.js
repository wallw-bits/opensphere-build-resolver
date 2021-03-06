'use strict';

const Promise = require('bluebird');
const src = require('./src');
const options = require('./options');
const externs = require('./externs');
const defines = require('./defines');
const builder = require('./builder-writer');
const java = require('./java-writer');
const json = require('./json-writer');
const tests = require('./test-writer');
const path = require('path');
const utils = require('../../utils.js');

var basePackage = null;

/**
 * Resolve GCC configuration for a package.
 * @param {Object} pack The package
 * @param {string} projectDir The package directory
 * @param {number} depth The resolved depth
 * @return {Promise} A promise that resolves when resolution is complete
 */
const resolver = function(pack, projectDir, depth) {
  if (utils.isConfigPackage(pack)) {
    return Promise.resolve();
  }

  // This block covers a couple of weird cases:
  //
  // Case 1:
  //
  // appA
  //   \
  //   appB
  //
  // appB is treating appA as a library
  //
  // Case 2:
  //
  // appA  appA-plugin-x
  //   \    /
  //    \  /
  //    appB
  //
  // appB is treating appA and appA-plugin-x as libraries

  if (!basePackage) {
    basePackage = pack;
  } else if ((utils.isPluginPackage(pack) &&
      !utils.isPluginOfPackage(basePackage, pack)) ||
      utils.isAppPackage(pack) && depth > 0) {
    if (pack.build.gcc) {
      // so remove entry_point and define config
      delete pack.build.gcc.entry_point;
      delete pack.build.gcc.define;
    }
  }

  return Promise.all([
    src.resolver(pack, projectDir, depth),
    externs.resolver(pack, projectDir, depth),
    defines.resolver(pack, projectDir, depth),
    options.resolver(pack, projectDir, depth),
    tests.resolver(pack, projectDir, depth)
  ]);
};

const postResolver = function(pack, projectDir) {
  if (pack.build && pack.build.type === 'config') {
    return Promise.resolve();
  }

  return src.postResolver(pack, projectDir);
};

const getOptions = function(pack, outputDir) {
  // the compiler options are not defined in camelcase
  /* eslint camelcase: "off" */
  var opts = Object.assign({}, require('./options-base'));
  if (utils.isAppPackage(pack)) {
    opts = Object.assign(opts, require('./options-app'));
  } else {
    opts = Object.assign(opts, require('./options-lib'));
  }

  opts.output_manifest = path.join(outputDir, 'gcc-manifest');
  opts.create_source_map = path.join(outputDir, pack.name + '.min.map');

  src.adder(pack, opts);
  externs.adder(pack, opts);
  options.adder(pack, opts);
  defines.adder(pack, opts);

  if (!opts.entry_point && !opts.closure_entry_point) {
    throw new Error('ERROR: build.gcc.entry_point must be defined in ' +
        pack.name + '\'s package.json');
  }

  return opts;
};

const writer = function(pack, outputDir) {
  if (pack.build && pack.build.type === 'config') {
    return Promise.resolve();
  }

  var options = getOptions(pack, outputDir);

  return Promise.all([
    builder.writer(pack, outputDir, options),
    java.writer(pack, outputDir, options),
    json.writer(pack, outputDir, options),
    defines.writer(pack, outputDir, options),
    tests.writer(pack, outputDir, options)
  ]);
};

const clear = function() {
  src.clear();
  externs.clear();
  options.clear();
  defines.clear();
  tests.clear();
};

module.exports = {
  clear: clear,
  resolver: resolver,
  postResolver: postResolver,
  writer: writer,
  _getOptions: getOptions
};
