import { Route } from "./routes.js"; 
import HttpContext from "./context.js";

/** Implementation of EventTarget that can await for all event listeners before dispatchEvent() returns  */
export class ServerEventTarget {

  #map = new Map();

  #lazyGetEventArray(eventName) {
    if (!this.#map.get(eventName)) {
      this.#map.set(eventName, []);
    }
    return this.#map.get(eventName);
  }

  addEventListener(eventName, callback) {
    const a = this.#lazyGetEventArray(eventName);
    if (a.indexOf(callback) === -1) {
      a.push(callback);
    }
  }

  removeEventListener(eventName, callback) {
    const a = this.#lazyGetEventArray(eventName);
    const index = a.indexOf(callback);
    if (index !== -1) {
      a.splice(index, 1);
    }
  }

  async dispatchEvent(event) {
    if (!(event instanceof Event)) {
      throw new TypeError(`Failed to dispatch ${event}`);
    }
    for (const callback of this.#lazyGetEventArray(event.type)) {
      await callback(event);
    }
  }

}

export class ServerEvent extends Event {

  constructor(...args) {
    super(...args);
  }

}

export class ServerListenEvent extends ServerEvent {

  #port = -1;
  get port() {
    return this.#port;
  }

  constructor(port, ...args) {
    super("listen", ...args);
    this.#port = port;
  }

}

export class ServerStopEvent extends ServerEvent {

  constructor(...args) {
    super("stop", ...args);
  }

}

export class HttpContextEvent extends ServerEvent {

  #context = null;
  /** @type {HttpContext} The context in which this event was fired. */
  get context() {
    return /**/ this.#context;
  }

  /** @param {HttpContext} context The context in which this event was fired. */
  constructor(name, context, ...args) {
    super(name, ...args);
    this.#context = context;
  }

}

export class RequestReceivedEvent extends HttpContextEvent {

  /** @param {HttpContext} context The context in which this event was fired. */
  constructor(context, ...args) {
    super("requestReceived", context, ...args);
  }

}

export class RouteMatchedEvent extends HttpContextEvent {

  #route = null;
  /** @type {Route} The Route that was matched. */
  get route() {
    return this.#route;
  }

  /**
   * @param {HttpContext} context The context in which this event was fired.
   * @param {Route} route The Route that was matched.
   */
  constructor(context, route, ...args) {
    super("routeMatched", context, route, ...args);
  }

}

export class NoRoutesMatchedEvent extends HttpContextEvent {

  /** @param {HttpContext} context The context in which this event was fired. */
  constructor(context, ...args) {
    super("noRoutesMatched", context, ...args);
  }

}

export class BeforeResponseSentEvent extends HttpContextEvent {

  /** @param {HttpContext} context The context in which this event was fired. */
  constructor(context, ...args) {
    super("beforeResponseSent", context, ...args);
  }

}

/** EventTarget-like object that allows adding, pausing, and removing recurring events @unstable @experimental */
export class Timer {

  #a = [];

  addTimer(intervalMs, callback) {
    const chronlet = this.#getChronletByCallback(callback);
    if (chronlet === null) {
      const newbornChronlet = new Chronlet(intervalMs, callback);
      this.#a.push(newbornChronlet);
      newbornChronlet.start();
    }
    else {
      chronlet.intervalMs = intervalMs;
      chronlet.start();
    }
  }

  removeTimer(callback) {
    const chronlet = this.#getChronletByCallback(callback);
    if (chronlet !== null) {
      const index = this.#a.indexOf(chronlet);
      this.#a.splice(index, 1);
    }
  }

  pauseTimer(callback) {
    const chronlet = this.#getChronletByCallback(callback);
    if (chronlet !== null) {
      chronlet.stop();
    }
  }

  removeAll() {
    this.#a.forEach(c => c.stop());
    this.#a = [];
  }

  pauseAll() {
    this.#a.forEach(c => c.stop());
  }

  #getChronletByCallback(callback) {
    const a = this.#a.filter(c => c.callback === callback);
    if (a.length < 1) {
      return null;
    }
    else {
      return a[0];
    }
  }

}

class Chronlet {

  intervalMs;
  callback;
  id = null;

  constructor(intervalMs, callback) {
    this.intervalMs = intervalMs;
    this.callback = callback;
  }

  start() {
    this.id = setInterval(this.callback, this.intervalMs);
  }

  stop() {
    if (this.id !== null) {
      clearInterval(this.id);
      this.id = null;
    }
  }

}