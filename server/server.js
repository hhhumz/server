import { Logger, DefaultLogger } from "./../core/api.js";
import HttpContext from "./context.js";
import { Route, StaticMountRoute, StaticFileRoute } from "./routes.js";
import * as Events from "./event.js";

export default class Server {

  /** @type {Function<Error,HttpContext>} */
  mainLoopErrorHandler = null;

  #routes = [];
  #sslCert = null;
  #sslKey = null;
  #logger = null;
  suppressDefaultLogging = false;

  #denoServer = null;
  #abortController = new AbortController();
  #eventTarget = new Events.ServerEventTarget();
  #timer = new Events.Timer();

  /**
   * @param {{
   *   sslCertPath: string
   *   sslKeyPath: string
   *   logger: Logger
   *   suppressDefaultLogging: boolean
   *   mainLoopErrorHandler: Function
   * }} options 
   */
  constructor(options) {
    options = options ?? {};
    if (options["sslCertPath"] && options["sslKeyPath"]) {
      this.addSslFromFile(options["sslCertPath"], options["sslKeyPath"]);
    }

    this.suppressDefaultLogging = !!options["suppressDefaultLogging"];
    this.#logger = (options["logger"] instanceof Logger) ? options["logger"] : new DefaultLogger();

    this.mainLoopErrorHandler = hasFunction(options, "mainLoopErrorHandler")
      ? options.mainLoopErrorHandler :
      (error, context) => this.#lastResortErrorHandler(error, context);

    this.addDefaultEventListeners();
    const signalListener = async () => {
      console.log();
      this.logSuppressable("Stopping server from signal\u2026");
      await this.stop();
      Deno.exit(0);
    }
    Deno.addSignalListener("SIGINT", signalListener);
    Deno.addSignalListener("SIGTERM", signalListener);
  }

  addDefaultEventListeners() {
    this.addEventListener("listen", event => {
      this.logSuppressable(`Starting server on port ${event.port}\u2026`);
    });
    this.addEventListener("stop", event => {
      this.logSuppressable("Server stopped.");
    });
    this.addEventListener("requestReceived", event => {
      //
    });
    this.addEventListener("noRoutesMatched", event => {
      if (!(event.context.response instanceof Response)) {
        //this.mainLoopErrorHandler(new HttpError("Not Found", 404), event.context);
      }
    });
    this.addEventListener("beforeResponseSent", event => {
      const ip = event.context.ip ?? "<unknown ip>";
      this.logSuppressable(`${event.context.requestPath} (${event.context.requestMethod}|${event.context?.response?.status}) from ${ip}`);
    });
  }

  addSsl(cert, key) {
    if (typeof(cert) === "string" && typeof(key) === "string" && cert && key) {
      this.#sslCert = cert;
      this.#sslKey = key;
    }
    else {
      this.#sslCert = null;
      this.#sslKey = null;
    }
  }

  addSslFromFile(certPath, keyPath) {
    try {
      this.addSsl(Deno.readTextFileSync(certPath), Deno.readTextFileSync(keyPath));
    }
    catch (error) {
      this.log("[ERROR] Reading SSL details:", error);
    }
  }

  addStaticMountRoute(routePath, mountPoint) {
    this.addRoute(new StaticMountRoute(routePath, mountPoint));
  }

  addStaticFileRoute(routePath, filePath) {
    this.addRoute(new StaticFileRoute(routePath, filePath));
  }

  addRoute(routeObject) {
    if (!(routeObject instanceof Route)) {
      throw new TypeError("Must provide a valid Route object that implements .matches(HttpContext) and .execute(contHttpContextext)");
    }
    this.#routes.push(routeObject);
  }

  async handleRequest(request, info) {
    const context = new HttpContext(request, info);
    await context.loadJson(); // TODO should probably not do this depending on the body type
    await this.#safeDispatchEvent(context, new Events.RequestReceivedEvent(context));

    // Only check routes if the last event didn't already put some response or error.
    if (!context.response && !context.error) {
      let match = false;
      for (const route of this.#routes) {
        if (match) break; // TODO: is the option to have "fall-through" routes
                          // if preceding ones fail normally needed ? idk
        if (route.matches(context)) {
          match = true;
          await this.#safeDispatchEvent(context, new Events.RouteMatchedEvent(context, route));
          try {
            await route.execute(context);
          }
          catch (error) {
            context.setError(error);
            // If the route has defined an error handler, call it
            if (hasFunction(route, "handleError")) {
              await route.handleError(context, error);
            }
            else {
              await this.#handleMainLoopError(error, context);
            }
          }
        }
      }
      if (!match) {
        await this.#safeDispatchEvent(context, new Events.NoRoutesMatchedEvent(context));
      }
    }


    // Verify a response has been provided.
    if (!(context.response instanceof Response)) {
      if (context.error) {
        await this.#handleMainLoopError(context.error, context);
      }
      else {
        await this.#handleMainLoopError(new Error("No response was provided. Set one with HttpContext.respond()"), context);
      }
    }

    // TODO: at some point, probably a little bit earlier than here, the
    // context.response should somehow be made immutable for safety
    //
    // The response definitely should not be modifiable at this point
    await this.#safeDispatchEvent(context, new Events.BeforeResponseSentEvent(context));
    context.applyCookies();
    return context.response;
  }

  async serve(port) {
    // TODO clean this section up ..
    const denoRequestHandler = async (...a) => await this.handleRequest(...a);
    const onListen = async () => await this.dispatchEvent(new Events.ServerListenEvent(port));
    const signal = this.#abortController.signal;
    const denoConfig = { port, onListen, signal };
    if (this.#sslCert !== null && this.#sslKey !== null) {
      denoConfig.cert = this.#sslCert;
      denoConfig.key = this.#sslKey;
    }
    try {
      this.#denoServer = Deno.serve(denoConfig, denoRequestHandler);
      await this.#denoServer.finished;
    } 
    catch (error) {
      if (error instanceof Deno.errors.AddrInUse) {
        this.log("Warning: Server tried to start when already in use!");
      }
      else {
        throw error;
      }
    }
  }

  /** @experimental */
  async serveAndWatch(port, watchDirs) {
    this.serve(port);
    this.log("Watching paths: " + watchDirs.toString());
    const fileWatcher = Deno.watchFs(watchDirs ?? "./");
    for await (const event of fileWatcher) {
      fileWatcher.close();
      this.log("Restarting due to file changes: " + event.paths.toString());
      await this.stop();
    }
  }

  async stop() {
    if (!this.#denoServer) {
        this.log("Warning: Non-existent server tried to stop.");
    }
    else {
      this.#timer.removeAll();
      await this.#denoServer.shutdown();
      await this.#denoServer.finished;
      await this.dispatchEvent(new Events.ServerStopEvent());
    }
  }

  addEventListener(...a) {
    this.#eventTarget.addEventListener(...a);
  }

  removeEventListener(...a) {
    this.#eventTarget.removeEventListener(...a);
  }

  async dispatchEvent(...a) {
    await this.#eventTarget.dispatchEvent(...a);
  }

  addTimer(...a) {
    this.#timer.addTimer(...a);
  }

  removeTimer(...a) {
    this.#timer.removeTimer(...a);
  }

  pauseTimer(...a) {
    this.#timer.pauseTimer(...a);
  }

  log(...args) {
    this.#logger.log(...args);
  }

  logSuppressable(...args) {
    if (!this.suppressDefaultLogging) {
      this.log(...args);
    }
  }

  /**
   * @param {Error} error 
   * @param {HttpContext} context 
   * @param {Event} event
   */
  async #handleMainLoopError(error, context, event=null) {
    const inEvent = event instanceof Event ? " in " + event.constructor.name : "";
    this.logSuppressable(`Handling error for path ${context.requestPath}${inEvent}:`, error);
    if (typeof(this.mainLoopErrorHandler) === "function") {
      await this.mainLoopErrorHandler(error, context);
    }
    else {
      this.#lastResortErrorHandler(error, context);
    }
  }

  async #safeDispatchEvent(context, event) {
    try {
      await this.dispatchEvent(event);
    }
    catch (error) {
      await this.#handleMainLoopError(error, context, event);
    }
  }

  #lastResortErrorHandler(error, context) {
    if (error instanceof HttpError) {
      context.respondJson({message: error.message}, error.statusCode);
    }
    else {
      context.respondJson({message: "Internal Server Error"}, 500);
    }
  }

}

function hasFunction(object, functionName) {
  return !!object && typeof(object[functionName]) === "function";
}

/**
 * Interface intended for HTTP errors that should ultimately
 * be propagated to the sender in a response.
 * @interface
 */
export class HttpError extends Error {

  static [Symbol.hasInstance](instance) {
    return typeof(instance["message"]) === "string" && Number.isInteger(instance["statusCode"]);
  }

  #statusCode;
  /** @type {number} An integer between 100-599, i.e. a valid HTTP response status code. */
  get statusCode() {
    return this.#statusCode;
  }

  #error;
  /** @type {?Error} The parent error that caused this one, if any. */
  get error() {
    return this.#error;
  }

  constructor(message, statusCode, error) {
    super(message ?? "Internal Server Error");
    this.#statusCode = 
      (!Number.isInteger(statusCode) || Number.isNaN(statusCode) || statusCode < 100 || statusCode > 599) 
      ? 500 : statusCode;
    this.#error = error;
  }

}