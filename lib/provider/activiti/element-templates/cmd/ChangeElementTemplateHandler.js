'use strict';

var findExtension = require('../Helper').findExtension,
    findExtensions = require('../Helper').findExtensions,
    findActivitiErrorEventDefinition = require('../Helper').findActivitiErrorEventDefinition;

var handleLegacyScopes = require('../util/handleLegacyScopes');

var createActivitiExecutionListenerScript = require('../CreateHelper').createActivitiExecutionListenerScript,
    createActivitiFieldInjection = require('../CreateHelper').createActivitiFieldInjection,
    createActivitiIn = require('../CreateHelper').createActivitiIn,
    createActivitiInWithBusinessKey = require('../CreateHelper').createActivitiInWithBusinessKey,
    createActivitiOut = require('../CreateHelper').createActivitiOut,
    createActivitiProperty = require('../CreateHelper').createActivitiProperty,
    createInputParameter = require('../CreateHelper').createInputParameter,
    createOutputParameter = require('../CreateHelper').createOutputParameter,
    createActivitiErrorEventDefinition = require('../CreateHelper').createActivitiErrorEventDefinition,
    createError = require('../CreateHelper').createError;

var EventDefinitionHelper = require('../../../../helper/EventDefinitionHelper');

var getRoot = require('../../../../Utils').getRoot;

var getBusinessObject = require('bpmn-js/lib/util/ModelUtil').getBusinessObject;

var is = require('bpmn-js/lib/util/ModelUtil').is,
    isAny = require('bpmn-js/lib/features/modeling/util/ModelingUtil').isAny;

var find = require('lodash/find'),
    forEach = require('lodash/forEach'),
    isString = require('lodash/isString'),
    keys = require('lodash/keys'),
    remove = require('lodash/remove');

var CAMUNDA_SERVICE_TASK_LIKE = [
  'activiti:class',
  'activiti:delegateExpression',
  'activiti:expression'
];

/**
 * Applies an element template to an element. Sets `activiti:modelerTemplate` and
 * `activiti:modelerTemplateVersion`.
 */
function ChangeElementTemplateHandler(bpmnFactory, commandStack, modeling) {
  this._bpmnFactory = bpmnFactory;
  this._commandStack = commandStack;
  this._modeling = modeling;
}

ChangeElementTemplateHandler.$inject = [
  'bpmnFactory',
  'commandStack',
  'modeling'
];

module.exports = ChangeElementTemplateHandler;

/**
   * Change an element's template and update its properties as specified in `newTemplate`. Specify
   * `oldTemplate` to update from one template to another. If `newTemplate` isn't specified the
   * `activiti:modelerTemplate` and `activiti:modelerTemplateVersion` properties will be removed from
   * the element.
   *
   * @param {Object} context
   * @param {Object} context.element
   * @param {Object} [context.oldTemplate]
   * @param {Object} [context.newTemplate]
   */
ChangeElementTemplateHandler.prototype.preExecute = function(context) {
  var element = context.element,
      newTemplate = context.newTemplate,
      oldTemplate = context.oldTemplate;

  var self = this;

  // Update activiti:modelerTemplate attribute
  this._updateActivitiModelerTemplate(element, newTemplate);

  if (newTemplate) {

    // Update properties
    this._updateProperties(element, oldTemplate, newTemplate);

    // Update activiti:ExecutionListener properties
    this._updateActivitiExecutionListenerProperties(element, newTemplate);

    // Update activiti:Field properties
    this._updateActivitiFieldProperties(element, oldTemplate, newTemplate);

    // Update activiti:In and activiti:Out properties
    this._updateActivitiInOutProperties(element, oldTemplate, newTemplate);

    // Update activiti:InputParameter and activiti:OutputParameter properties
    this._updateActivitiInputOutputParameterProperties(element, oldTemplate, newTemplate);

    // Update activiti:Property properties
    this._updateActivitiPropertyProperties(element, oldTemplate, newTemplate);

    // Update activiti:ErrorEventDefinition properties
    this._updateActivitiErrorEventDefinitionProperties(element, oldTemplate, newTemplate);

    // Update properties for each scope
    forEach(handleLegacyScopes(newTemplate.scopes), function(newScopeTemplate) {
      self._updateScopeProperties(element, oldTemplate, newScopeTemplate, newTemplate);
    });

  }
};

ChangeElementTemplateHandler.prototype._getOrCreateExtensionElements = function(element) {
  var bpmnFactory = this._bpmnFactory,
      modeling = this._modeling;

  var businessObject = getBusinessObject(element);

  var extensionElements = businessObject.get('extensionElements');

  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', {
      values: []
    });

    extensionElements.$parent = businessObject;

    modeling.updateProperties(element, {
      extensionElements: extensionElements
    });
  }

  return extensionElements;
};

/**
 * Update `activiti:ErrorEventDefinition` properties of specified business object. Event
 * definitions can only exist in `bpmn:ExtensionElements`.
 *
 * Ensures an bpmn:Error exists for the event definition.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiErrorEventDefinitionProperties = function(element, oldTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:errorEventDefinition';
  });

  // (1) Do not override if no updates
  if (!newProperties.length) {
    return;
  }

  var businessObject = this._getOrCreateExtensionElements(element);

  var oldErrorEventDefinitions = findExtensions(element, [ 'activiti:ErrorEventDefinition' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldEventDefinition = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newBinding = newProperty.binding;

    // (2) Update old event definitions
    if (oldProperty && oldEventDefinition) {

      if (!propertyChanged(oldEventDefinition, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldEventDefinition,
          properties: {
            expression: newProperty.value
          }
        });
      }

      remove(oldErrorEventDefinitions, oldEventDefinition);
    }

    // (3) Create new event definition + error
    else {
      var rootElement = getRoot(getBusinessObject(element)),
          newError = createError(newBinding.errorRef, rootElement, bpmnFactory),
          newEventDefinition =
            createActivitiErrorEventDefinition(newBinding, newProperty.value, newError, businessObject, bpmnFactory);

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: rootElement,
        propertyName: 'rootElements',
        objectsToAdd: [ newError ],
        objectsToRemove: []
      });

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ newEventDefinition ],
        objectsToRemove: []
      });
    }

  });

  // (4) Remove old event definitions
  if (oldErrorEventDefinitions.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldErrorEventDefinitions
    });
  }
};

/**
 * Update `activiti:ExecutionListener` properties of specified business object. Execution listeners
 * will always be overridden. Execution listeners can only exist in `bpmn:ExtensionElements`.
 *
 * @param {djs.model.Base} element
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiExecutionListenerProperties = function(element, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:executionListener';
  });

  // (1) Do not override old execution listeners if no new execution listeners specified
  if (!newProperties.length) {
    return;
  }

  var businessObject = this._getOrCreateExtensionElements(element);

  // (2) Remove old execution listeners
  var oldExecutionListeners = findExtensions(element, [ 'activiti:ExecutionListener' ]);

  // (3) Add new execution listeners
  var newExecutionListeners = newProperties.map(function(newProperty) {
    var newBinding = newProperty.binding,
        propertyValue = newProperty.value;

    return createActivitiExecutionListenerScript(newBinding, propertyValue, bpmnFactory);
  });

  commandStack.execute('properties-panel.update-businessobject-list', {
    element: element,
    currentObject: businessObject,
    propertyName: 'values',
    objectsToAdd: newExecutionListeners,
    objectsToRemove: oldExecutionListeners
  });
};

/**
 * Update `activiti:Field` properties of specified business object.
 * If business object is `activiti:ExecutionListener` or `activiti:TaskListener` `fields` property
 * will be updated. Otherwise `extensionElements.values` property will be updated.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 * @param {ModdleElement} businessObject
 */
ChangeElementTemplateHandler.prototype._updateActivitiFieldProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:field';
  });

  // (1) Do not override old fields if no new fields specified
  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var propertyName = isAny(businessObject, [ 'activiti:ExecutionListener', 'activiti:TaskListener' ])
    ? 'fields'
    : 'values';

  var oldFields = findExtensions(element, [ 'activiti:Field' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldField = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newBinding = newProperty.binding;

    // (2) Update old fields
    if (oldProperty && oldField) {

      if (!propertyChanged(oldField, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldField,
          properties: {
            string: newProperty.value
          }
        });
      }

      remove(oldFields, oldField);
    }

    // (3) Add new fields
    else {
      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: propertyName,
        objectsToAdd: [ createActivitiFieldInjection(newBinding, newProperty.value, bpmnFactory) ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old fields
  if (oldFields.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: propertyName,
      objectsToAdd: [],
      objectsToRemove: oldFields
    });
  }
};

/**
 * Update `activiti:In` and `activiti:Out` properties of specified business object. Only
 * `bpmn:CallActivity` and events with `bpmn:SignalEventDefinition` can have ins. Only
 * `activiti:CallActivity` can have outs.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiInOutProperties = function(element, oldTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:in'
      || newBindingType === 'activiti:in:businessKey'
      || newBindingType === 'activiti:out';
  });

  // (1) Do not override old fields if no new fields specified
  if (!newProperties.length) {
    return;
  }

  // Get extension elements of either signal event definition or call activity
  var businessObject = this._getOrCreateExtensionElements(
    EventDefinitionHelper.getSignalEventDefinition(element) || element);

  var oldInsAndOuts = findExtensions(businessObject, [ 'activiti:In', 'activiti:Out' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldBinding = oldProperty && oldProperty.binding,
        oldInOurOut = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding,
        newBindingType = newBinding.type,
        newInOrOut,
        properties = {};

    // (2) Update old ins and outs
    if (oldProperty && oldInOurOut) {

      if (!propertyChanged(oldInOurOut, oldProperty)) {
        if (newBindingType === 'activiti:in') {
          if (newBinding.expression) {
            properties[ 'activiti:sourceExpression' ] = newPropertyValue;
          } else {
            properties[ 'activiti:source' ] = newPropertyValue;
          }
        } else if (newBindingType === 'activiti:in:businessKey') {
          properties[ 'activiti:businessKey' ] = newPropertyValue;
        } else if (newBindingType === 'activiti:out') {
          properties[ 'activiti:target' ] = newPropertyValue;
        }
      }

      // Update `activiti:local` property if it changed
      if ((oldBinding.local && !newBinding.local) || !oldBinding.local && newBinding.local) {
        properties.local = newBinding.local;
      }

      if (keys(properties)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldInOurOut,
          properties: properties
        });
      }

      remove(oldInsAndOuts, oldInOurOut);
    }

    // (3) Add new ins and outs
    else {
      if (newBindingType === 'activiti:in') {
        newInOrOut = createActivitiIn(newBinding, newPropertyValue, bpmnFactory);
      } else if (newBindingType === 'activiti:out') {
        newInOrOut = createActivitiOut(newBinding, newPropertyValue, bpmnFactory);
      } else if (newBindingType === 'activiti:in:businessKey') {
        newInOrOut = createActivitiInWithBusinessKey(newBinding, newPropertyValue, bpmnFactory);
      }

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ newInOrOut ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old ins and outs
  if (oldInsAndOuts.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldInsAndOuts
    });
  }
};

/**
 * Update `activiti:InputParameter` and `activiti:OutputParameter` properties of specified business
 * object. Both can only exist in `activiti:InputOutput` which can exist in `bpmn:ExtensionElements`
 * or `activiti:Connector`.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiInputOutputParameterProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:inputParameter' || newBindingType === 'activiti:outputParameter';
  });

  // (1) Do not override old inputs and outputs if no new inputs and outputs specified
  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var inputOutput;

  if (is(businessObject, 'activiti:Connector')) {
    inputOutput = businessObject.get('activiti:inputOutput');

    if (!inputOutput) {
      inputOutput = bpmnFactory.create('activiti:InputOutput');

      commandStack.execute('properties-panel.update-businessobject', {
        element: element,
        businessObject: businessObject,
        properties: {
          inputOutput: inputOutput
        }
      });
    }
  } else {
    inputOutput = findExtension(businessObject, 'activiti:InputOutput');

    if (!inputOutput) {
      inputOutput = bpmnFactory.create('activiti:InputOutput');

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ inputOutput ],
        objectsToRemove: []
      });
    }
  }

  var oldInputs = inputOutput.get('activiti:inputParameters')
    ? inputOutput.get('activiti:inputParameters').slice()
    : [];

  var oldOutputs = inputOutput.get('activiti:outputParameters')
    ? inputOutput.get('activiti:outputParameters').slice()
    : [];

  var propertyName;

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldInputOrOutput = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    var newInputOrOutput,
        properties;

    // (2) Update old inputs and outputs
    if (oldProperty && oldInputOrOutput) {

      if (!propertyChanged(oldInputOrOutput, oldProperty)) {
        if (is(oldInputOrOutput, 'activiti:InputParameter')) {
          properties = {
            value: newPropertyValue
          };
        } else {
          properties = {
            name: newPropertyValue
          };
        }

        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldInputOrOutput,
          properties: properties
        });
      }

      if (is(oldInputOrOutput, 'activiti:InputParameter')) {
        remove(oldInputs, oldInputOrOutput);
      } else {
        remove(oldOutputs, oldInputOrOutput);
      }
    }

    // (3) Add new inputs and outputs
    else {
      if (newBindingType === 'activiti:inputParameter') {
        propertyName = 'inputParameters';

        newInputOrOutput = createInputParameter(newBinding, newPropertyValue, bpmnFactory);
      } else {
        propertyName = 'outputParameters';

        newInputOrOutput = createOutputParameter(newBinding, newPropertyValue, bpmnFactory);
      }

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: inputOutput,
        propertyName: propertyName,
        objectsToAdd: [ newInputOrOutput ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old inputs and outputs
  if (oldInputs.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: inputOutput,
      propertyName: 'inputParameters',
      objectsToAdd: [],
      objectsToRemove: oldInputs
    });
  }

  if (oldOutputs.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: inputOutput,
      propertyName: 'outputParameters',
      objectsToAdd: [],
      objectsToRemove: oldOutputs
    });
  }
};

ChangeElementTemplateHandler.prototype._updateActivitiModelerTemplate = function(element, newTemplate) {
  var modeling = this._modeling;

  modeling.updateProperties(element, {
    'activiti:modelerTemplate': newTemplate && newTemplate.id,
    'activiti:modelerTemplateVersion': newTemplate && newTemplate.version
  });
};

/**
 * Update `activiti:Property` properties of specified business object. `activiti:Property` can only
 * exist in `activiti:Properties`.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 * @param {ModdleElement} businessObject
 */
ChangeElementTemplateHandler.prototype._updateActivitiPropertyProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'activiti:property';
  });

  // (1) Do not override old properties if no new properties specified
  if (!newProperties.length) {
    return;
  }

  if (businessObject) {
    businessObject = this._getOrCreateExtensionElements(businessObject);
  } else {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var activitiProperties = findExtension(businessObject, 'activiti:Properties');

  if (!activitiProperties) {
    activitiProperties = bpmnFactory.create('activiti:Properties');

    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [ activitiProperties ],
      objectsToRemove: []
    });
  }

  var oldActivitiProperties = activitiProperties.get('activiti:values')
    ? activitiProperties.get('activiti:values').slice()
    : [];

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldActivitiProperty = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding;

    // (2) Update old properties
    if (oldProperty && oldActivitiProperty) {

      if (!propertyChanged(oldActivitiProperty, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldActivitiProperty,
          properties: {
            value: newPropertyValue
          }
        });
      }

      remove(oldActivitiProperties, oldActivitiProperty);
    }

    // (3) Add new properties
    else {
      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: activitiProperties,
        propertyName: 'values',
        objectsToAdd: [ createActivitiProperty(newBinding, newPropertyValue, bpmnFactory) ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old properties
  if (oldActivitiProperties.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: activitiProperties,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldActivitiProperties
    });
  }
};

/**
 * Update `bpmn:conditionExpression` property of specified element. Since condition expression is
 * is not primitive it needs special handling.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldProperty
 * @param {Object} newProperty
 */
ChangeElementTemplateHandler.prototype._updateConditionExpression = function(element, oldProperty, newProperty) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack,
      modeling = this._modeling;

  var newBinding = newProperty.binding,
      newPropertyValue = newProperty.value;

  if (!oldProperty) {
    modeling.updateProperties(element, {
      conditionExpression: bpmnFactory.create('bpmn:FormalExpression', {
        body: newPropertyValue,
        language: newBinding.scriptFormat
      })
    });

    return;
  }

  var oldBinding = oldProperty.binding,
      oldPropertyValue = oldProperty.value;

  var businessObject = getBusinessObject(element),
      conditionExpression = businessObject.get('bpmn:conditionExpression');

  var properties = {};

  if (conditionExpression.get('body') === oldPropertyValue) {
    properties.body = newPropertyValue;
  }

  if (conditionExpression.get('language') === oldBinding.scriptFormat) {
    properties.language = newBinding.scriptFormat;
  }

  if (!keys(properties).length) {
    return;
  }

  commandStack.execute('properties-panel.update-businessobject', {
    element: element,
    businessObject: conditionExpression,
    properties: properties
  });
};

ChangeElementTemplateHandler.prototype._updateProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var self = this;

  var commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'property';
  });

  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = getBusinessObject(element);
  }

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        newBinding = newProperty.binding,
        newBindingName = newBinding.name,
        newPropertyValue = newProperty.value,
        changedElement,
        properties;

    if (newBindingName === 'conditionExpression') {
      self._updateConditionExpression(element, oldProperty, newProperty);
    } else {

      if (is(businessObject, 'bpmn:Error')) {
        changedElement = businessObject;
      } else {
        changedElement = element;
      }

      if (oldProperty && propertyChanged(changedElement, oldProperty)) {
        return;
      }

      properties = {};

      properties[ newBindingName ] = newPropertyValue;

      // Only one of `activiti:class`, `activiti:delegateExpression` and `activiti:expression` can be
      // set
      // TODO(philippfromme): ensuring only one of these properties is set at a time should be
      // implemented in a behavior and not in this handler and properties panel UI
      if (CAMUNDA_SERVICE_TASK_LIKE.indexOf(newBindingName) !== -1) {
        CAMUNDA_SERVICE_TASK_LIKE.forEach(function(activitiServiceTaskLikeProperty) {
          if (activitiServiceTaskLikeProperty !== newBindingName) {
            properties[ activitiServiceTaskLikeProperty ] = undefined;
          }
        });
      }

      commandStack.execute('properties-panel.update-businessobject', {
        element: element,
        businessObject: businessObject,
        properties: properties
      });
    }
  });
};

/**
 * Update properties for a specified scope.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newScopeTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateScopeProperties = function(element, oldTemplate, newScopeTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var scopeName = newScopeTemplate.type;

  var scopeElement;

  scopeElement = findOldScopeElement(element, newScopeTemplate, newTemplate);

  if (!scopeElement) {

    scopeElement = bpmnFactory.create(scopeName);
  }

  var oldScopeTemplate = findOldScopeTemplate(newScopeTemplate, oldTemplate);

  // Update properties
  this._updateProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update activiti:ExecutionListener properties
  this._updateActivitiExecutionListenerProperties(element, newScopeTemplate);

  // Update activiti:In and activiti:Out properties
  this._updateActivitiInOutProperties(element, oldScopeTemplate, newScopeTemplate);

  // Update activiti:InputParameter and activiti:OutputParameter properties
  this._updateActivitiInputOutputParameterProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update activiti:Field properties
  this._updateActivitiFieldProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update activiti:Property properties
  this._updateActivitiPropertyProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Assume: root elements were already been created in root by referenced event
  // definition binding
  if (isRootElementScope(scopeName)) {
    return;
  }

  var extensionElements = this._getOrCreateExtensionElements(element);

  commandStack.execute('properties-panel.update-businessobject-list', {
    element: element,
    currentObject: extensionElements,
    propertyName: 'values',
    objectsToAdd: [ scopeElement ],
    objectsToRemove: []
  });
};

// helpers //////////

/**
 * Find old business object matching specified old property.
 *
 * @param {djs.model.Base|ModdleElement} element
 * @param {Object} oldProperty
 *
 * @returns {ModdleElement}
 */
function findOldBusinessObject(element, oldProperty) {
  var businessObject = getBusinessObject(element),
      propertyName;

  var oldBinding = oldProperty.binding,
      oldBindingType = oldBinding.type;

  if (oldBindingType === 'activiti:field') {

    if (isAny(businessObject, [ 'activiti:ExecutionListener', 'activiti:TaskListener' ])) {
      propertyName = 'activiti:fields';
    } else {
      propertyName = 'bpmn:values';
    }

    if (!businessObject || !businessObject.get(propertyName) || !businessObject.get(propertyName).length) {
      return;
    }

    return find(businessObject.get(propertyName), function(oldBusinessObject) {
      return oldBusinessObject.get('activiti:name') === oldBinding.name;
    });
  }

  if (oldBindingType === 'activiti:in') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('target') === oldBinding.target;
    });
  }

  if (oldBindingType === 'activiti:in:businessKey') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return isString(oldBusinessObject.get('businessKey'));
    });
  }

  if (oldBindingType === 'activiti:out') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('source') === oldBinding.source ||
        oldBusinessObject.get('sourceExpression') || oldBinding.sourceExpression;
    });
  }

  if (oldBindingType === 'activiti:inputParameter' || oldBindingType === 'activiti:outputParameter') {

    if (is(businessObject, 'activiti:Connector')) {
      businessObject = businessObject.get('activiti:inputOutput');

      if (!businessObject) {
        return;
      }
    } else {
      businessObject = findExtension(businessObject, 'activiti:InputOutput');

      if (!businessObject) {
        return;
      }
    }

    if (oldBindingType === 'activiti:inputParameter') {
      return find(businessObject.get('activiti:inputParameters'), function(oldBusinessObject) {
        return oldBusinessObject.get('activiti:name') === oldBinding.name;
      });
    } else {
      return find(businessObject.get('activiti:outputParameters'), function(oldBusinessObject) {
        var definition;

        if (oldBinding.scriptFormat) {
          definition = oldBusinessObject.get('activiti:definition');

          return definition && definition.get('activiti:value') === oldBinding.source;
        } else {
          return oldBusinessObject.get('activiti:value') === oldBinding.source;
        }
      });
    }

  }

  if (oldBindingType === 'activiti:property') {
    if (!businessObject || !businessObject.get('values') || !businessObject.get('values').length) {
      return;
    }

    businessObject = findExtension(businessObject, 'activiti:Properties');

    if (!businessObject) {
      return;
    }

    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('activiti:name') === oldBinding.name;
    });
  }

  if (oldBindingType === 'activiti:errorEventDefinition') {
    return findActivitiErrorEventDefinition(element, oldBinding.errorRef);
  }
}

/**
 * Find old property matching specified new property.
 *
 * @param {Object} oldTemplate
 * @param {Object} newProperty
 *
 * @returns {Object}
 */
function findOldProperty(oldTemplate, newProperty) {
  if (!oldTemplate) {
    return;
  }

  var oldProperties = oldTemplate.properties,
      newBinding = newProperty.binding,
      newBindingName = newBinding.name,
      newBindingType = newBinding.type;

  if (newBindingType === 'property') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'property' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'activiti:field') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'activiti:field' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'activiti:in') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'activiti:in') {
        return;
      }

      // Always override if change from source to source expression or vice versa
      if ((oldBinding.expression && !newBinding.expression) ||
        !oldBinding.expression && newBinding.expression) {
        return;
      }

      return oldBinding.target === newBinding.target;
    });
  }

  if (newBindingType === 'activiti:in:businessKey') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'activiti:in:businessKey';
    });
  }

  if (newBindingType === 'activiti:out') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'activiti:out' && (
        oldBinding.source === newBinding.source ||
        oldBinding.sourceExpression === newBinding.sourceExpression
      );
    });
  }

  if (newBindingType === 'activiti:inputParameter') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'activiti:inputParameter') {
        return;
      }

      return oldBindingName === newBindingName
        && oldBinding.scriptFormat === newBinding.scriptFormat;
    });
  }

  if (newBindingType === 'activiti:outputParameter') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'activiti:outputParameter') {
        return;
      }

      return oldBinding.source === newBinding.source
        && oldBinding.scriptFormat === newBinding.scriptFormat;
    });
  }

  if (newBindingType === 'activiti:property') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'activiti:property' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'activiti:errorEventDefinition') {
    return find(oldProperties, function(oldProperty) {
      var newBindingRef = newBinding.errorRef,
          oldBinding = oldProperty.binding,
          oldBindingRef = oldBinding.errorRef,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'activiti:errorEventDefinition'
        && oldBindingRef === newBindingRef;
    });
  }
}

function findOldScopeElement(element, scopeTemplate, template) {
  var scopeName = scopeTemplate.type,
      id = scopeTemplate.id;

  if (scopeName === 'activiti:Connector') {
    return findExtension(element, 'activiti:Connector');
  }

  if (scopeName === 'bpmn:Error') {

    // (1) find by error event definition binding
    var errorEventDefinitionBinding = findErrorEventDefinitionBinding(template, id);

    if (!errorEventDefinitionBinding) {
      return;
    }

    // (2) find error event definition
    var errorEventDefinition = findOldBusinessObject(element, errorEventDefinitionBinding);

    if (!errorEventDefinition) {
      return;
    }

    // (3) retrieve referenced error
    return errorEventDefinition.errorRef;
  }
}

function isRootElementScope(scopeName) {
  return [ 'bpmn:Error' ].includes(scopeName);
}

function findOldScopeTemplate(scopeTemplate, oldTemplate) {
  var scopeName = scopeTemplate.type,
      scopeId = scopeTemplate.id,
      scopes = oldTemplate && handleLegacyScopes(oldTemplate.scopes);

  return scopes && find(scopes, function(scope) {

    if (isRootElementScope(scopeName)) {
      return scope.id === scopeId;
    }

    return scope.type === scopeName;
  });
}

function findErrorEventDefinitionBinding(template, templateErrorId) {
  return find(template.properties, function(property) {
    return property.binding.errorRef === templateErrorId;
  });
}

/**
 * Check whether property was changed after being set by template.
 *
 * @param {djs.model.Base|ModdleElement} element
 * @param {Object} oldProperty
 *
 * @returns {boolean}
 */
function propertyChanged(element, oldProperty) {
  var businessObject = getBusinessObject(element);

  var oldBinding = oldProperty.binding,
      oldBindingName = oldBinding.name,
      oldBindingType = oldBinding.type,
      oldPropertyValue = oldProperty.value,
      conditionExpression,
      definition;

  if (oldBindingType === 'property') {
    if (oldBindingName === 'conditionExpression') {
      conditionExpression = businessObject.get('bpmn:conditionExpression');

      return conditionExpression.get('bpmn:body') !== oldPropertyValue;
    }

    return businessObject.get(oldBindingName) !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:field') {
    return businessObject.get('activiti:string') !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:in') {
    if (oldBinding.expression) {
      return businessObject.get('sourceExpression') !== oldPropertyValue;
    } else {
      return businessObject.get('activiti:source') !== oldPropertyValue;
    }
  }

  if (oldBindingType === 'activiti:in:businessKey') {
    return businessObject.get('activiti:businessKey') !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:out') {
    return businessObject.get('activiti:target') !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:inputParameter') {
    if (oldBinding.scriptFormat) {
      definition = businessObject.get('activiti:definition');

      return definition && definition.get('activiti:value') !== oldPropertyValue;
    } else {
      return businessObject.get('activiti:value') !== oldPropertyValue;
    }
  }

  if (oldBindingType === 'activiti:outputParameter') {
    return businessObject.get('activiti:name') !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:property') {
    return businessObject.get('activiti:value') !== oldPropertyValue;
  }

  if (oldBindingType === 'activiti:errorEventDefinition') {
    return businessObject.get('expression') !== oldPropertyValue;
  }
}