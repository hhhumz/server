import { Route } from "./routes.js"; 
import HttpContext from "./context.js";

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
    return this.#context;
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
  get context() {
    return this.#context;
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

export class ResponseSentEvent extends HttpContextEvent {

  /** @param {HttpContext} context The context in which this event was fired. */
  constructor(context, ...args) {
    super("responseSent", context, ...args);
  }

}