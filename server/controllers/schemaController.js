const { buildClientSchema, getIntrospectionQuery } = require('graphql');
const fetch = require('node-fetch');
// const fs = require('fs');
// const path = require('path');

const schemaController = {};

schemaController.introspect = (req, res, next) => {
  fetch(req.body.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({"query": getIntrospectionQuery()})
  }).then((res) =>res.json())
    .then((data) => {
      res.locals.introspectionResult = data.data;
      return next();
    })
    .catch(() => next({
      log: 'There was a problem running the introspection query',
      status: 400,
      message: { err: 'There was a problem running the introspection query' },
    }));
};

// converts schema into an object of Types and their respective fields (along with references to other Types)
// output is in format e.g.:

schemaController.convertSchema = (req, res, next) => {
  try {
    const { sourceSchema } = req.body;
    const cleanedSchema = cleanSchema(sourceSchema);
    const d3Json = schemaToD3(cleanedSchema);
    // Writes and saves the JSON file into root folder
    // fs.writeFileSync(path.resolve(__dirname, 'SWschema.json'), JSON.stringify(sourceSchema, null, 2));
    // Stores the file path for future middleware to access to implement in d3
    // res.locals.path = path.resolve(__dirname, 'd3schema.json');
    res.locals.schema = buildClientSchema(sourceSchema);
    res.locals.d3json = d3Json;
    return next();
  } catch {
    return next({
      log: 'There was a problem converting the introspected schema',
      status: 500,
      message: { err: 'There was a problem converting the introspected schema' },
    });
  }
};

// cleanSchema cleans the schema received from the client's graphQL endpoint into format:
/*
{
  Query: [
    'info',
    { teams: 'Team' },
    { players: 'Player' },
    { games: 'Fixture' },
    { fixtures: 'Fixture' }
  ],
  ....
  Result: [ 'goalsHomeTeam', 'goalsAwayTeam' ]
}
*/
const cleanSchema = (sourceSchema) => {
  const schemaTypes = sourceSchema.__schema.types;
  const types = {};
  for (let i = 0; i < schemaTypes.length; i++) {
    // iterate only through relevant types (tables)
    if (
      schemaTypes[i].fields !== null &&
      schemaTypes[i].name.indexOf('__') === -1
    ) {
      const fieldsList = [];
      // Iterate through the fields array of each type (table)
      for (let j = 0; j < schemaTypes[i].fields.length; j++) {
        if (
          schemaTypes[i].fields[j].name &&
          !schemaTypes[i].fields[j].isDeprecated
        ) {
          // checks if the type of a field references another Type
          if (schemaTypes[i].fields[j].type.kind === 'OBJECT') {
            const fieldsLink = {};
            fieldsLink[schemaTypes[i].fields[j].name] =
              schemaTypes[i].fields[j].type.name;
            fieldsList.push(fieldsLink);
          }
          // checks if the type of a field is a list and references another Type
          else if (
            schemaTypes[i].fields[j].type.kind === 'LIST' &&
            schemaTypes[i].fields[j].type.ofType.kind === 'OBJECT'
          ) {
            const fieldsLink = {};
            fieldsLink[schemaTypes[i].fields[j].name] =
              schemaTypes[i].fields[j].type.ofType.name;
            fieldsList.push(fieldsLink);
          } else if (
            schemaTypes[i].fields[j].type.ofType &&
            schemaTypes[i].fields[j].type.ofType.ofType
          ) {
            // creates a key-value pair of relationship between the field name and the Type if it points to another Type
            const fieldsLink = {};
            fieldsLink[schemaTypes[i].fields[j].name] =
              schemaTypes[i].fields[j].type.ofType.ofType.name;
            fieldsList.push(fieldsLink);
          } else {
            fieldsList.push(schemaTypes[i].fields[j].name);
          }
        }
      }
      types[schemaTypes[i].name] = fieldsList;
    }
  }
  return types;
};

// schemaToD3 converts the "cleaned" schema into a JSON file for d3 in format:

/*
{
  nodes: [
    { name: 'Query', type: 'Type' },
    { name: 'info', type: 'field' },
    ....
  ],
  links: [
    { source: 'info', target: 'Info' },
    { source: 'Query', target: 'info' },
    ...
  ]
}

*/

const schemaToD3 = (cleanedSchema) => {
  const d3Json = {};
  const linksArray = [];
  const duplicateChecker = {};
  const duplicateFields = [];
  // name each node with an & followed by the Type that the field belongs to, to solve for cases
  // where multiple fields have the same name across different Types
/* eslint-disable */

// Loop through the cleanedSchema once to check for duplicate fields
  for (let key in cleanedSchema) {
    for (let i = 0; i < cleanedSchema[key].length; i++) {
      const field = Object.keys(cleanedSchema[key][i]);
      if (typeof cleanedSchema[key][i] === 'object') {
        const fieldObject = JSON.stringify(cleanedSchema[key][i]);
        // if current field element already exists in duplicateTracker
        if (duplicateChecker[fieldObject]) {
          duplicateFields.push(field[0]);
        } else duplicateChecker[fieldObject] = true;
      }
    }
  }
  for (let key in cleanedSchema) {
    for (let i = 0; i < cleanedSchema[key].length; i++) {
      const fieldName = Object.keys(cleanedSchema[key][i]);
      if (typeof cleanedSchema[key][i] !== 'object') {
        // create links from each Type to their fields
        let sourceName = key + '&';
        let targetName = cleanedSchema[key][i]+ '&' + key;
        if (duplicateFields.includes(cleanedSchema[key][i])) {
          targetName = cleanedSchema[key][i]+ '&multiple';
        }
        linksArray.push(createNode(sourceName, 'Type', targetName, 'field'))
      } 
      // if an object
      else {
        // Create link from current Type to field
        let sourceName = key + '&';
        let targetName = fieldName[0] + '&' + key;
        if (duplicateFields.includes(fieldName[0])) {
          targetName = fieldName[0]+ '&multiple';
        }
        linksArray.push(createNode(sourceName, 'Type', targetName, 'field'));
        // Create link from fields to other Types
        sourceName = fieldName[0] + '&' + key;
        if (duplicateFields.includes(fieldName[0])) {
          sourceName = fieldName[0]+ '&multiple';
        }
        targetName = cleanedSchema[key][i][fieldName[0]] + '&';
        linksArray.push(createNode(sourceName, 'field', targetName, 'Type'));
      }
    }
  }
  d3Json.links = linksArray;
  d3Json.duplicates = duplicateFields;
  return d3Json;
};

const createNode = (sourceName, sourceType, targetName, targetType) => {
  const linkObj = {};
  const nodeSource = {};
  const nodeTarget = {};
  nodeSource.name = sourceName;
  nodeSource.type = sourceType;
  nodeSource.highlighted = false;
  linkObj.source = nodeSource;
  nodeTarget.name = targetName;
  nodeTarget.type = targetType;
  nodeTarget.highlighted = false;
  linkObj.target = nodeTarget;
  return linkObj;
};

module.exports = schemaController;
