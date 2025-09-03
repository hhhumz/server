/** Validates objects such as JSON input using chained assertions. */
export default class Validator {

  /** @returns {Object} The Object to be validated */
  get object() { return this.#object; }
  #object = {};

  /** @returns {Boolean} Whether any assertion has failed. */
  get anyFailed() { return this.#anyFailed; }
  #anyFailed = false;

  
  /** @returns {Boolean} Whether the last assertion failed. */
  get lastFailed() { return this.#lastFailed; }
  #lastFailed = false;

  /** @param {Object} object The Object to be validated */
  constructor(object) {
    this.#object = object;
  }

  /**
   * Asserts that the key exists.
   * @param {String} key
   */
  has(key) {
    return this.assert(() => key in this.#object);
  }

  /**
   * Asserts that the key exists and is not null nor undefined.
   * @param {String} key
   */
  hasNotNull(key) {
    return this.assert(() => this.#object[key] !== null && this.#object[key] !== undefined);
  }

  /**
   * Asserts that the key exists, is not null nor undefined, and
   * is of the specified type (according to the typeof operator.)
   * @param {String} key
   * @param {String} type The type to check, according to the typeof keywword.
   */
  isOfType(key, typeStr) {
    this.hasNotNull(key).assert(() => typeof(this.#object[key]) === typeStr);
  }

  /**
   * Asserts that some condition or callback resolves to true.
   * @param {Boolean | Function} condition A booleanish expression, or boolean-returning
   * function that will be passed the object being validated
   */
  assert(condition) {
    this.#lastFailed = false;
    try {
      let result = false;
      if (typeof(condition) === "function") {
        result = condition();
      }
      else {
        result = !!condition;
      }
      if (!result) throw new AssertionFailed();
    }
    catch (_error) {
      this.#anyFailed = true;
      this.#lastFailed = true;
    }
    return this;
  }

  /** @param {Function} callback A callback to be executed if the previous assertion has failed. */
  else(callback, ...callbackArgs) {
    if (this.#lastFailed) {
      callback(...callbackArgs);
    }
    return this;
  }

  /** @param {Function} callback A callback to be executed if any assertion has failed. */
  catchAll(callback, ...callbackArgs) {
    if (this.#anyFailed) {
      callback(...callbackArgs);
    }
    return this;
  }

  /** @param {Function} callback A callback to be executed if no assertion has failed. */
  success(callback, ...callbackArgs) {
    if (!this.#lastFailed && !this.#anyFailed) {
      callback(...callbackArgs);
    }
    return this;
  }

  /** Changes which object this validator operates on and resets the failure state. */
  setObject(object) {
    this.#object = object;
    this.reset();
  }

  /** Resets the failure state. */
  reset() {
    this.#anyFailed = false;
    this.#lastFailed = false;
  }

  toString() {
    return `Validator{lastFailed: ${this.#lastFailed}, anyFailed: ${this.#anyFailed}}`;
  }

}

class AssertionFailed extends Error {}