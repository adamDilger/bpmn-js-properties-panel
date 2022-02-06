'use strict';

var assign = require('min-dash').assign,
    forEach = require('min-dash').forEach,
    keys = require('min-dash').keys,
    isObject = require('min-dash').isObject;

/**
 * Converts legacy scopes descriptor to newer supported array structure.
 *
 * For example, it transforms
 *
 * scopes: {
 *   'activiti:Connector':
 *     { properties: []
 *   }
 * }
 *
 * to
 *
 * scopes: [
 *   {
 *     type: 'activiti:Connector',
 *     properties: []
 *   }
 * ]
 *
 * @param {ScopesDescriptor} scopes
 *
 * @returns {Array}
 */
module.exports = function handleLegacyScopes(scopes) {
  var scopesAsArray = [];

  if (!isObject(scopes)) {
    return scopes;
  }

  forEach(keys(scopes), function(scopeName) {
    scopesAsArray.push(assign({
      type: scopeName
    }, scopes[scopeName]));
  });

  return scopesAsArray;
};