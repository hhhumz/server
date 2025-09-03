import _0 from "./validator.js";
import { Args as _1, DefaultLogger as _2 } from "./utilities.js";

export const Validator = _0;
export const Args = _1;
export const DefaultLogger = _2;

export function isPlainObject(object) {
  return (
    !!object
    && typeof object === "object"
    && (object.__proto__ === null || object.__proto__ === Object.prototype)
  );
}

export const UNKNOWN_IP = Symbol();