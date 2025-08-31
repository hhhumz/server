import Log from "./log.js";

/** @experimental */
export default class JsDb {

  #path;
  #default;

  /** @experimental */
  constructor(path) {
    this.#path = path;
  }

  async read() {
    try {
      const string = await Deno.readTextFile(this.#path);
      return JSON.parse(string);
    }
    catch (error) {
      Log.printError(error);
    }
    return null;
  }

  async write(obj) {
    try {
      await Deno.writeTextFile(this.#path, JSON.stringify(obj));
    }
    catch (error) {
      Log.printError(error);
    }
  }

}