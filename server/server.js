import { DefaultLogger } from "./../core/api.js";
import HttpContext from "./context.js";
import { StaticMountRoute, StaticFileRoute } from "./routes.js";
import * as Events from "./event.js";

export default class Server {

  #routes = [];
  #sslCert = null;
  #sslKey = null;
  suppressDefaultLogging = false;
  #logger = null;
  #defaultErrorHandler = null;

  #abortController = new AbortController();
  #eventTarget = new EventTarget();

  /**
   * @param {{
   * sslCertPath: string
   * sslKeyPath: string
   * suppressDefaultLogging: boolean
   * defaultErrorHandler: Function
   * }} options 
   * 
   */
  constructor(options) {
    if (options["sslCertPath"] && options["sslKeyPath"]) {
      this.addSslFromFile(options["sslCertPath"], options["sslKeyPath"]);
    }

    this.suppressDefaultLogging = !!options["suppressDefaultLogging"];
    this.#logger = isValidLoggerObject(options["logger"]) ? options["logger"] : new DefaultLogger();

    this.#defaultErrorHandler = hasFunction(options, "defaultErrorHandler")
      ? options.defaultErrorHandler :
      (error, context) => this.defaultHandleError(error, context);

    this.addEventListener("listen", event => {
      this.logSuppressable(`Starting server on port ${event.port}\u2026`);
    });
    this.addEventListener("stop", event => {
      // TODO: total size sent
      this.logSuppressable(`Server stopped.`);
    });
    this.addEventListener("requestReceived", event => {
      this.logSuppressable(`${event.context.requestPath} (${event.context.requestMethod}) from <ip here>`);
    });
    this.addEventListener("responseSent", event => {
      // TODO: stringify body. also track size
      this.logSuppressable(`Response: ${event.context.response.status}`);
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
    if (!isValidRouteObject(routeObject)) {
      throw new TypeError("Must provide a valid Route object");
    }
    this.#routes.push(routeObject);
  }

  async handleRequest(request) {
    const context = new HttpContext(request);
    await context.loadJson(); // TODO should probably not do this depending on the body type
    this.dispatchEvent(new Events.RequestReceivedEvent(context));

    let match = false;
    for (const route of this.#routes) {
      if (match) break; // TODO: is the option to have "fall-through" routes
                        // if preceding ones fail normally needed ? idk
      if (route.matches(context)) {
        match = true;
        try {
          this.dispatchEvent(new Events.RouteMatchedEvent(context, route));
          await route.execute(context);
        }
        catch (error1) {
          context.setError(error1);
          try {
            // If the route has defined an error handler, call it
            if (hasFunction(route, "handleError")) {
              await route.handleError(context, error1);
            }
            else {
              await this.defaultHandleError(error1, context);
            }
          }
          catch (error2) {
            context.setError(context.error2);
            this.log("[ERROR] Handling error:", error1);
            this.log("[ERROR] Another error was caught while handling the above error: ", error2);
          }
        }
      }
    }

    if (!match) {
      this.dispatchEvent(new Events.NoRoutesMatchedEvent(context));
    }

    // Verify a response has been provided.
    if (!(context.response instanceof Response)) {
      if (context.error) {
        this.defaultHandleError(context.error, context);
      }
      else {
        this.defaultHandleError(new Error("No response was provided. Set one with HttpContext.respond()"), context);
      }
    }

    // TODO: at some point, probably a little bit earlier than here, the
    // context.response should somehow be made immutable for safety
    //
    // The response definitely should not be modifiable at this point
    this.dispatchEvent(new Events.ResponseSentEvent(context));
    return context.response;
  }

  async serve(port) {
    const denoConfig = {
      port: port,
      signal: this.#abortController.signal,
      onListen() {
        this.dispatchEvent(new Events.ServerListenEvent(port));
      }
    };
    if (this.#sslCert !== null && this.#sslKey !== null) {
      denoConfig.cert = this.#sslCert;
      denoConfig.key = this.#sslKey;
    }
    const denoServer = Deno.serve(denoConfig, async request => await this.handleRequest(request));
    await denoServer.finished;
    this.dispatchEvent(new Events.ServerStopEvent());
  }

  /** @experimental */
  async serveAndWatch(port, watchDirs) {
    const denoServer = this.serve(port);
    this.log("Watching paths: " + watchDirs.toString());
    const fileWatcher = Deno.watchFs(watchDirs ?? "./");
    for await (const event of fileWatcher) {
      fileWatcher.close();
      this.log("Restarting server due to file changes: " + event.paths.toString());
      this.stop();
    }
    await denoServer.finished;
  }

  stop() {
    this.#abortController.abort();
  }

  get addEventListener() {
    return this.#eventTarget.addEventListener;
  }

  get removeEventListener() {
    return this.#eventTarget.removeEventListener;
  }

  get dispatchEvent() {
    // TODO: should this be a call to dispatchEvent wrapped in a safe
    // try/catch block that calls the default error handler?
    return this.#eventTarget.dispatchEvent;
  }

  log(...args) {
    this.#logger.log(...args);
  }

  // TODO: add argument to filter by constructor options (e.g. logResponse, logRequest)
  logSuppressable(...args) {
    if (!this.suppressDefaultLogging) this.log(...args);
  }

  /**
   * @param {Error} error 
   * @param {HttpContext} context 
   */
  async defaultHandleError(error, context) {
    this.logSuppressable("Handling error", error); // TODO should be configurable
    if (typeof(this.#defaultErrorHandler) === "function") {
      await this.#defaultErrorHandler(context, error1);
    }
    else {
      // Last resort error handler
      if (isValidHttpError(error)) {
        context.respondJson({message: error.message}, error.statusCode);
      }
      else {
        context.respondJson({message: "Internal Server Error"}, 500);
      }
    }
  }

}

function isValidRouteObject(object) {
  return hasFunction(object, "execute") && hasFunction(object, "matches");
}

function isValidLoggerObject(object) {
  return hasFunction(object, "log");
}

function isValidHttpError(object) {
  return typeof(object["message"]) === "string" && Number.isInteger(object["statusCode"]);
}

function hasFunction(object, functionName) {
  return typeof(object[functionName]) === "function";
}

/**
 * Interface intended for HTTP errors that should ultimately
 * be propagated to the sender in a response.
 * @interface
 */
export class HttpError extends Error {

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
    if (!Number.isInteger(statusCode) || Number.isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
      this.#statusCode = 500;
    }
    this.#error = error;
  }

}