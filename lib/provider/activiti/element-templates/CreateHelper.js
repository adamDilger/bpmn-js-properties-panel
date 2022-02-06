'use strict';

var assign = require('lodash/assign');

var nextId = require('../../../Utils').nextId;

/**
 * Create an input parameter representing the given
 * binding and value.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createInputParameter(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: value
    });
  } else {
    parameterValue = value;
  }

  return bpmnFactory.create('activiti:InputParameter', {
    name: binding.name,
    value: parameterValue,
    definition: parameterDefinition
  });
}

module.exports.createInputParameter = createInputParameter;


/**
 * Create an output parameter representing the given
 * binding and value.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createOutputParameter(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: binding.source
    });
  } else {
    parameterValue = binding.source;
  }

  return bpmnFactory.create('activiti:OutputParameter', {
    name: value,
    value: parameterValue,
    definition: parameterDefinition
  });
}

module.exports.createOutputParameter = createOutputParameter;


/**
 * Create activiti property from the given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiProperty(binding, value, bpmnFactory) {
  return bpmnFactory.create('activiti:Property', {
    name: binding.name,
    value: value || ''
  });
}

module.exports.createActivitiProperty = createActivitiProperty;


/**
 * Create activiti:in element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiIn(binding, value, bpmnFactory) {

  var properties = createActivitiInOutAttrs(binding, value);

  return bpmnFactory.create('activiti:In', properties);
}

module.exports.createActivitiIn = createActivitiIn;


/**
 * Create activiti:in with businessKey element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiInWithBusinessKey(binding, value, bpmnFactory) {
  return bpmnFactory.create('activiti:In', {
    businessKey: value
  });
}

module.exports.createActivitiInWithBusinessKey = createActivitiInWithBusinessKey;


/**
 * Create activiti:out element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiOut(binding, value, bpmnFactory) {
  var properties = createActivitiInOutAttrs(binding, value);

  return bpmnFactory.create('activiti:Out', properties);
}

module.exports.createActivitiOut = createActivitiOut;


/**
 * Create activiti:executionListener element containing an inline script from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiExecutionListenerScript(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: value
    });
  } else {
    parameterValue = value;
  }

  return bpmnFactory.create('activiti:ExecutionListener', {
    event: binding.event,
    value: parameterValue,
    script: parameterDefinition
  });
}

module.exports.createActivitiExecutionListenerScript = createActivitiExecutionListenerScript;

/**
 * Create activiti:field element containing string or expression from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiFieldInjection(binding, value, bpmnFactory) {
  var DEFAULT_PROPS = {
    'string': undefined,
    'expression': undefined,
    'name': undefined
  };

  var props = assign({}, DEFAULT_PROPS);

  if (!binding.expression) {
    props.string = value;
  } else {
    props.expression = value;
  }
  props.name = binding.name;

  return bpmnFactory.create('activiti:Field', props);
}

module.exports.createActivitiFieldInjection = createActivitiFieldInjection;

/**
 * Create activiti:errorEventDefinition element containing expression and errorRef
 * from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {ModdleElement} error
 * @param {ModdleElement} parent
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createActivitiErrorEventDefinition(binding, value, error, parent, bpmnFactory) {
  var errorRef = error,
      expression = value;

  var newErrorEventDefinition = bpmnFactory.create('activiti:ErrorEventDefinition', {
    expression: expression,
    errorRef: errorRef
  });

  newErrorEventDefinition.$parent = parent;

  return newErrorEventDefinition;
}

module.exports.createActivitiErrorEventDefinition = createActivitiErrorEventDefinition;

/**
 * Create bpmn:error element containing a specific error id given by a binding.
 *
 * @param {String} bindingErrorRef
 * @param {ModdleElement} parent
 * @param {BpmnFactory} bpmnFactory
 *
 * @return { ModdleElement }
 */
function createError(bindingErrorRef, parent, bpmnFactory) {
  var error = bpmnFactory.create('bpmn:Error', {

    // we need to later retrieve the error from a binding
    id: nextId('Error_' + bindingErrorRef + '_')
  });

  error.$parent = parent;

  return error;
}

module.exports.createError = createError;

// helpers ////////////////////////////

/**
 * Create properties for activiti:in and activiti:out types.
 */
function createActivitiInOutAttrs(binding, value) {

  var properties = {};

  // Explicitly cover all conditions as specified here:
  // https://github.com/activiti/activiti-modeler/blob/develop/docs/element-templates/README.md#activitiin
  if (binding.type === 'activiti:in') {
    if (binding.target && !binding.expression && !binding.variables) {
      properties.target = binding.target;
      properties.source = value;

    } else if (binding.target && binding.expression === true && !binding.variables) {
      properties.target = binding.target;
      properties.sourceExpression = value;

    } else if (!binding.target && !binding.expression && binding.variables === 'local') {
      properties.local = true;
      properties.variables = 'all';

    } else if (binding.target && !binding.expression && binding.variables === 'local') {
      properties.local = true;
      properties.source = value;
      properties.target = binding.target;

    } else if (binding.target && binding.expression && binding.variables === 'local') {
      properties.local = true;
      properties.sourceExpression = value;
      properties.target = binding.target;

    } else if (!binding.target && !binding.expression && binding.variables === 'all') {
      properties.variables = 'all';
    } else {
      throw new Error('invalid configuration for activiti:in element template binding');
    }
  }

  // Explicitly cover all conditions as specified here:
  // https://github.com/activiti/activiti-modeler/blob/develop/docs/element-templates/README.md#activitiout
  if (binding.type === 'activiti:out') {
    if (binding.source && !binding.sourceExpression && !binding.variables) {
      properties.target = value;
      properties.source = binding.source;

    } else if (!binding.source && binding.sourceExpression && !binding.variables) {
      properties.target = value;
      properties.sourceExpression = binding.sourceExpression;

    } else if (!binding.source && !binding.sourceExpression && binding.variables === 'all') {
      properties.variables = 'all';

    } else if (binding.source && !binding.sourceExpression && binding.variables === 'local') {
      properties.local = true;
      properties.source = binding.source;
      properties.target = value;

    } else if (!binding.source && binding.sourceExpression && binding.variables === 'local') {
      properties.local = true;
      properties.sourceExpression = binding.sourceExpression;
      properties.target = value;

    } else if (!binding.source && !binding.sourceExpression && binding.variables === 'local') {
      properties.local = true;
      properties.variables = 'all';
    } else {
      throw new Error('invalid configuration for activiti:out element template binding');
    }
  }

  return properties;
}
