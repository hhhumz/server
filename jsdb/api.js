import SchemaBuilder from "./schema.js";
import { JsDbConnection } from "./runtime.js";
import { stockTypeIds } from "./types.js";

/** @unstable */
export default class JsDb {


  static get Type() {
    return stockTypeIds;
  }

  static build() {
    return new SchemaBuilder();
  }

  static async connect(filePath) {
    const connection = new JsDbConnection(filePath);
    await connection.load();
    return connection;
  }

}