import { JsDbError } from "./core.js";

class TypeDef {

  get typeId() {
    throw new NotImplementedError();
  }

  canSerialize(object) {
    return true;
  }

  serialize(object) {
    return object; // TODO better default behavior
  }

  canDeserialize(object) {
    return true;
  }

  deserialize(object) {
    return object; // TODO better default behavior
  }

}

export const stockTypeIds = {
  BINARY: "Binary",
  BOOLEAN: "Boolean",
  DATE: "Date",
  INTEGER: "Integer",
  NUMBER: "Number",
  STRING: "String",
}

export function getTypeDef(typeId) {
  switch (typeId) {
    case stockTypeIds.BINARY: return new BinaryType();
    case stockTypeIds.BOOLEAN: return new BooleanType();
    case stockTypeIds.DATE: return new DateType();
    case stockTypeIds.INTEGER: return new IntegerType();
    case stockTypeIds.NUMBER: return new BinaryType();
    case stockTypeIds.STRING: return new StringType();
    default: throw new JsDbError(`Unknown type ${typeId}`);
  }
}

class StringType extends TypeDef {

  get typeId() {
    return "String";
  }

  canSerialize(object) {
    return typeof(object) === "string";
  }

}

class BooleanType extends TypeDef {

  get typeId() {
    return "Boolean";
  }

  canSerialize(object) {
    return typeof(object) === "boolean";
  }

}

class IntegerType extends TypeDef {

  get typeId() {
    return "Integer";
  }

  canSerialize(object) {
    return Number.isInteger(object);
  }

}

class NumberType extends TypeDef {

  get typeId() {
    return "Number";
  }

  canSerialize(object) {
    return !Number.isNaN(object) && typeof(object) === "number";
  }

}

class DateType extends TypeDef {

  get typeId() {
    return "Date";
  }

  canSerialize(object) {
    return object instanceof Date;
  }

  canDeserialize(object) {
    return Number.isInteger(object);
  }

  serialize(object) {
    return object.getTime();
  }

  deserialize(object) {
    return new Date(object);
  }

}

class BinaryType extends TypeDef {

  get typeId() {
    return "Binary";
  }
  
  // TODO ...

}

class NotImplementedError {}