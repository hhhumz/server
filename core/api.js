import _0 from "./validator.js";
import { Args as _1 } from "./utilities.js";

export const Validator = _0;
export const Args = _1;

export function isPlainObject(object) {
  return (
    !!object
    && typeof object === "object"
    && (object.__proto__ === null || object.__proto__ === Object.prototype)
  );
}

export function hasFunction(object, functionName) {
  return !!object && typeof(object[functionName]) === "function";
}


/**
 * @interface Logger
 */
export class Logger {

  static [Symbol.hasInstance](instance) {
    return hasFunction(instance, "log");
  }

  log(...args) {}

}

/** @implements Logger */
export class DefaultLogger {

  log(...args) {
    console.log("[wisp] " + getPaddedDate(), ...args);
  }

}

function getPaddedDate() {
  return new Date().toLocaleTimeString().padEnd(12);
}