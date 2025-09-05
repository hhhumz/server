import { log, xwrite, __SEP, JsDbError } from "./core.js";

export default class SchemaBuilder {

  #currentTable;
  #schemaJson = [];

  addTable(tableName) {
    validateFieldOrTableName(tableName);
    this.#currentTable = { tableName, fields: [] };
    this.#schemaJson.push(this.#currentTable);
    return this;
  }

  #check() {
    if (!this.#currentTable) {
      throw new JsDbError("There is no table");
    }
  }

  addField(fieldName, typeId, flags="") {
    this.#check();
    validateFieldOrTableName(fieldName);
    validateFlags(flags);
    this.#currentTable.fields.push({ fieldName, typeId, flags });
    return this;
  }

  addForeignKey(fieldName, otherTable, otherField, flags="") {
    this.#check();
    validateFieldOrTableName(fieldName);
    validateFlags(flags);
    const typeId = getFieldDefinition(otherTable, otherField, this.#schemaJson).typeId;
    this.#currentTable.fields.push({ fieldName, typeId, flags, fk: [otherTable, otherField] });
    return this;
  }

  addPrimaryKey(fieldName, typeId, flags="") {
    return this.addField(fieldName, typeId, "cru" + flags);
  }

  async exportToFile(filePath) {
    validateSchema(this.#schemaJson);
    const data = buildDatabase(this.#schemaJson);
    log(data);
    await xwrite(filePath, data);
  }

}


// schema is an array of TableDefinitions; TableDefinition is an array of Fields (String+Type+otherinfo)
// data is a map of table names to tables;
function buildDatabase(schemaJson) {
  return {
    schema: schemaJson,
    meta: {},
    data: createEmptyTables(schemaJson),
  };
}

function createEmptyTables(schemaJson) {
  const a = {};
  for (const tableDef of schemaJson) {
    a[tableDef.tableName] = [];
  }
  return a;
}

function validateSchema(schemaJson) {
  if (!(schemaJson instanceof Array)) {
    throw new Error();
  }
  for (const tableDef of schemaJson) {
    let hasPrimaryKey = false;
    for (const fieldDef of tableDef.fields) {
      if (isPrimaryKey(fieldDef)) {
        hasPrimaryKey = true;
        break;
      }
    }
    if (!hasPrimaryKey) {
      throw new JsDbError(`${tableDef.tableName} is missing a primary key`);
    }
  }
}

function getTableDefinition(tableName, schemaJson) {
  const tables = schemaJson.filter(value => value.tableName === tableName);
  if (tables.length < 1) {
    throw new JsDbError(`Table ${tableName} not found`);
  };
  return tables[0];
}

function getFieldDefinition(tableName, fieldName, schemaJson) {
  const table = getTableDefinition(tableName, schemaJson);
  const fields = table.fields.filter(value => value.fieldName === fieldName);
  if (fields.length < 1) {
    throw new JsDbError(`Field ${fieldName} not found in table ${tableName}`);
  }
  return fields[0];
}

function validateFlags(value) {
  if (typeof(value) !== "string" || value.indexOf(__SEP) > -1) {
    throw new JsDbError(`Invalid string value "${value}"`);
  }
}

function validateFieldOrTableName(value) {
  validateFlags(value);
  if (value === undefined || value === null || value.trim() === "") {
    throw new JsDbError("Argument required");
  }
}

export function isPrimaryKey(fieldDef) {
  return fieldDef.flags.indexOf("c") !== -1 // constant
    && fieldDef.flags.indexOf("r") !== -1 // required
    && fieldDef.flags.indexOf("u") !== -1; // unique
}