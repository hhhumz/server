import { JsDbError, xread, log, xwrite, genfid } from "./core.js";
import { isPrimaryKey } from "./schema.js";
import { getTypeDef, stockTypeIds } from "./types.js";

class Transaction {

  dataArray = [];
  paramArray = [];

  // for now a copy of old datas
  #backupData;

  save(databaseToRestore) {
    this.#backupData = deepCopyJson(databaseToRestore.data);
  }

  abort(databaseToRestore, error) {
    databaseToRestore.data = this.#backupData;
    log("Aborted transaction due to error; restored old state");
    throw error;
  }

}

export class JsDbConnection {

  #filePath;
  #database;
  /** @type {Map<String,TableDescriptor>} */
  #tableDescriptors = new Map();

  _debugPrint() {
    console.log(this.#database);
  }

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async load() {
    this.#database = await xread(this.#filePath);
    this.#tableDescriptors = buildDescriptors(this.#database.schema);
  }

  createRow(tableName) {
    const tableDescriptor = this.#getTable(tableName);
    const bean = new Bean(tableDescriptor);
    // check for autoincrementing integers
    for (let i = 0; i < tableDescriptor.fieldNum; i++) {
      const field = tableDescriptor.getFieldByIndex(i);
      if (
        field.flags.indexOf("a") !== -1
        && field.typeDef.typeId === stockTypeIds.INTEGER
      ) {
        const id = this.#autoIncrement(tableName, field.fieldName);
        bean.set(field.fieldName, id);
      }
    }
    return bean;
  }

  getItemCount(tableName) {
    return this.#database.data[tableName].length;
  }

  #autoIncrement(tableName, fieldName) {
    const fid = genfid(tableName, fieldName);
    if (!this.#database.meta.autoincrement) {
      this.#database.meta.autoincrement = {};
    }
    const a = this.#database.meta.autoincrement[fid];
    if (!a && a !== 0) {
      this.#database.meta.autoincrement[fid] = 0;
    }
    this.#database.meta.autoincrement[fid]++;
    return this.#database.meta.autoincrement[fid] - 1;
  }

  first(tableName, queryCallback) {
    if (!(queryCallback instanceof Function)) {
      throw new TypeError("Second argument must be a callback taking one Bean argument");
    }
    for (const row of this.#database.data[tableName]) {
      const bean = Bean.import(this.#getTable(tableName), row);
      if (queryCallback(bean)) {
        return bean;
      }
    }
    return null;
  }

  all(tableName, queryCallback) {
    if (!(queryCallback instanceof Function)) {
      throw new TypeError("Second argument must be a callback taking one Bean argument");
    }
    const a = [];
    for (const row of this.#database.data[tableName]) {
      const bean = Bean.import(this.#getTable(tableName), row);
      if (queryCallback(bean)) {
        a.push(bean);
      }
    }
    return a;
  }

  async commit(...beans) {
    const trans = new Transaction();
    trans.save(this.#database);
    try {
      for (let i = 0; i < beans.length; i++) {
        const bean = beans[i];
        if (!(bean instanceof Bean)) {
          throw new JsDbError(`Could not commit non-bean ${bean}`);
        }

        // Export the bean as an array and add it to the transaction.
        const exportedBean = bean.export();

        // Get the row index from its id. (TODO cache this?)
        const td = this.#getTable(bean.tableName);
        const idFieldIndex = td.getField(td.pkField).index;
        const rowId = exportedBean[idFieldIndex];
        let rowIndex = -1;
        for (let i = 0; i < this.#database.data[bean.tableName].length; i++) {
          const r = this.#database.data[bean.tableName][i]
          if (r[idFieldIndex] === rowId) {
            rowIndex = i;
            break;
          }
        }

        // Per-field validation
        for (let i = 0; i < exportedBean.length; i++) {
          const value = exportedBean[i];
          const fd = td.getFieldByIndex(i);
          if (fd.pk && rowIndex === -1) {
            if (valueExistsInColumn(this.#database.data, fd, value)) {
              throw new JsDbError(`Primary key Constraint error: value (${value}) already exists in (${fd.tableName},${fd.fieldName})`);
            }
          }
          if (fd.fkTable && rowIndex === -1) {
            const foreignFd = this.#getTable(fd.fkTable).getField(fd.fkField);
            if (!valueExistsInColumn(this.#database.data, foreignFd, value)) {
              throw new JsDbError(`Foreign key Constraint error: value (${value}) does not exist in (${foreignFd.tableName},${foreignFd.fieldName})`);
            }
          }
        }

        trans.dataArray[i] = exportedBean;
        trans.paramArray[i] = { index: rowIndex, tableName: bean.tableName };
      }

      // TODO:
      // update each row
      // deep copy each modified field's initial value
      // if an error in transaction, restore old data

      // TODO : Also, a bean can mark its fields as dirty in its set() method.
      // This might be useful when chemcking if stuff has changed? neds backup ? etc
      // deepEmquals()

      // for now just backup the entire thing :>

      for (let i = 0; i < trans.dataArray.length; i++) {
        const targetTable = trans.paramArray[i].tableName;
        let targetIndex = trans.paramArray[i].index;
        if (targetIndex === -1) {
          targetIndex = this.#database.data[targetTable].length;
        }
        this.#database.data[targetTable][targetIndex] = trans.dataArray[i];
      }
    }
    catch (error) {
      trans.abort(this.#database, error);
    }
    // log(`Successfully wrote ${beans.length} updated records to runtime memory`);
    await xwrite(this.#filePath, this.#database);
    // log("Successfully saved data to disk");
  }

  #getTable(tableName) {
    const td = this.#tableDescriptors.get(tableName);
    if (!td) {
      throw new JsDbError(`Table ${tableName} not found`);
    }
    return td;
  }

}

function _stringify(v) {
  if (v === null) {
    return "<empty>";
  }
  if (typeof(v) === "string") {
    return '"' + v + '"';
  }
  return v.toString();
}

function valueExistsInColumn(db, fieldDesc, value) {
  for (const row of db[fieldDesc.tableName]) {
    if (strictestEquals(value, row[fieldDesc.index])) {
      return true;
    }
  }
  return false;
}

function strictestEquals(v1, v2) {
  if (!isPkeyable(v1) || !isPkeyable(v2)) {
    throw new JsDbError("Could not compare one or more non-primitives", v1, v2);
  }
  return v1 === v2;
}

function isPkeyable(v) {
  return Number.isInteger(v) || typeof(v) === "string" || typeof(v) === "boolean";
}

function isLiteral(v) {
  return typeof(v) === "number" || typeof(v) === "string" || typeof(v) === "boolean" || v === null;
}

function strictClone(v) {
  if (isLiteral(v)) {
    return v;
  }
  if (v instanceof Array || v instanceof Object) {
    return deepCopyJson(v);
  }
  throw new JsDbError(`Could not clone non-primitive ${v}`);
}

function deepCopyJson(arrayOrObject) {
  if (arrayOrObject instanceof Array) {
    const val = [];
    for (const s of arrayOrObject) {
      val.push(strictClone(s));
    }
    return val;
  }
  else if (arrayOrObject instanceof Object) {
    const val = {};
    for (const s in arrayOrObject) {
      val[s] = strictClone(arrayOrObject[s]);
    }
    return val;
  }
  throw new JsDbError(`Could not clone non-primitive ${arrayOrObject}`);
}

// TODO prevent setting of constant fields
// TODO implement deletion
class Bean {

  #localData;
  #tableDescriptor;
  #isDeleted = false;
  get isDeleted() {
    return true;
  }

  get tableName() {
    return this.#tableDescriptor.tableName;
  }

  constructor(tableDescriptor, initialData) {
    this.#tableDescriptor = tableDescriptor;
    if (initialData instanceof Array && initialData.length === tableDescriptor.fieldNum) {
      this.#localData = initialData;
    }
    else {
      this.#localData = [];
      for (let i = 0; i < tableDescriptor.fieldNum; i++) {
        this.#localData.push(null);
      }
    }
  }

  static import(tableDescriptor, initialData) {
    const a = [];
    for (let i = 0; i < tableDescriptor.fieldNum; i++) {
      a.push(tableDescriptor.getFieldByIndex(i).typeDef.deserialize(initialData[i]));
    }
    return new this(tableDescriptor, a);
  }

  setMultiple(jsonObject) {
    for (const f in jsonObject) {
      this.set(f, jsonObject[f]);
    }
    return this;
  }

  set(fieldName, value) {
    this.#localData[this.#tableDescriptor.getField(fieldName).index] = value;
    return this;
  }

  get(fieldName) {
    return this.#localData[this.#tableDescriptor.getField(fieldName).index] ?? null;
  }

  delete() {
    this.#isDeleted = true;
  }

  export() {
    // Serialize each item in the array
    const a = [];
    for (let i = 0; i < this.#tableDescriptor.fieldNum; i++) {
      const fd = this.#tableDescriptor.getFieldByIndex(i);
      const val = this.#localData[i];
      if (fd.typeDef.canSerialize(val)) {
        a[i] = fd.typeDef.serialize(val);
      }
      else {
        throw new JsDbError(`Cannot serialize value ${val} as type ${fd.typeDef.typeId} for field ${fd.fieldName}`);
      }
    }
    return a;
  }

  toString() {
    let s = this.#tableDescriptor.tableName + "{";
    if (!this.#isDeleted) {
      for (let i = 0; i < this.#localData.length; i++) {
        s += this.#tableDescriptor.getFieldByIndex(i).fieldName
          + "=" + _stringify(this.#localData[i]);
        if (i !== this.#localData.length - 1) {
          s += ", "
        }
      }
    }
    else {
      s += "Deleted";
    }
    s += "}";
    return s;
  }

}

class TableDescriptor {

  #tableName;
  get tableName() {
    return this.#tableName;
  }
  /** @type {Map<String,FieldDescriptor>} */
  #fieldsMap = new Map();
  /** @type {Array<FieldDescriptor>} */
  #fieldsArr = [];
  #pkField;
  get pkField() {
    return this.#pkField;
  }

  constructor(tableDef) {
    this.#tableName = tableDef.tableName;
    for (let i = 0; i < tableDef.fields.length; i++) {
      const fieldDef = tableDef.fields[i];
      if (isPrimaryKey(fieldDef) && !this.#pkField) {
        this.#pkField = fieldDef.fieldName;
      }
      const fieldDesc = new FieldDescriptor(fieldDef, tableDef.tableName, i);
      this.#fieldsArr.push(fieldDesc);
      this.#fieldsMap.set(fieldDef.fieldName, fieldDesc);
    }
  }

  getField(fieldName) {
    const fd = this.#fieldsMap.get(fieldName);
    if (!fd) {
      throw new JsDbError(`Field ${fieldName} not found in table ${this.#tableName}`);
    }
    return fd;
  }

  getFieldByIndex(i) {
    if (i < 0 || i >= this.#fieldsArr.length) {
      throw new JsDbError(`Field #${i} not found in table ${this.#tableName}`);
    }
    return this.#fieldsArr[i];
  }

  get fieldNum() {
    return this.#fieldsArr.length;
  }

}

class FieldDescriptor {

  #fieldName;
  get fieldName() {
    return this.#fieldName;
  }

  #tableName;
  get tableName() {
    return this.#tableName;
  }

  #index;
  get index() {
    return this.#index;
  }

  #flags = "";
  get flags() {
    return this.#flags;
  }

  #typeDef;
  get typeDef() {
    return this.#typeDef;
  }

  #fkTable = null;
  get fkTable() {
    return this.#fkTable;
  }

  #fkField = null;
  get fkField() {
    return this.#fkField;
  }

  #pk = false;
  get pk() {
    return this.#pk;
  }

  constructor(fieldDef, tableName, index) {
    this.#fieldName = fieldDef.fieldName;
    if (validFk(fieldDef)) {
      this.#fkTable = fieldDef.fk[0];
      this.#fkField = fieldDef.fk[1];
    }
    this.#pk = isPrimaryKey(fieldDef);
    this.#tableName = tableName;
    this.#index = index;
    this.#flags = fieldDef.flags;
    this.#typeDef = getTypeDef(fieldDef.typeId);
  }

}

function buildDescriptors(schemaJson) {
  const map = new Map();
  for (const tableDef of schemaJson) {
    map.set(tableDef.tableName, new TableDescriptor(tableDef));
  }
  return map;
}

function validFk(fieldDef) {
  if (!(fieldDef.fk instanceof Array)) {
    return false;
  }
  return typeof(fieldDef.fk[0]) === "string"
    && typeof(fieldDef.fk[1]) === "string";
}