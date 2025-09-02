import Log from "./log.js";
import Http from "./http.js";
import { StaticMountRoute, StaticFileRoute } from "./routes.js";

export default class Server {

  #routes = [];
  #sslCert = null;
  #sslKey = null;
  #abortController = new AbortController();

  stop() {
    this.#abortController.abort();
  }

  addSsl(certPath, keyPath) {
    try {
      this.#sslCert = Deno.readTextFileSync(certPath);
      this.#sslKey = Deno.readTextFileSync(keyPath);
    }
    catch (error) {
      Log.log("There was an error reading SSL details.");
      Log.printError(error);
    }
  }

  addStaticMountRoute(routePath, mountPoint) {
    this.#routes.push(new StaticMountRoute(routePath, mountPoint));
  }

  addStaticFileRoute(routePath, filePath) {
    this.#routes.push(new StaticFileRoute(routePath, filePath));
  }

  addRoute(routeObject) {
    if (!isValidRouteObject(routeObject)) {
      throw new TypeError("Must provide a valid Route object or implementation");
    }
    this.#routes.push(routeObject);
  }

  async #handleRequest(r) {
    const request = Http.wrapRequest(r);
    try {
      Log.log(`${request.path} (${request.method})`);
      for (const route of this.#routes) {
        if (route.matches(request)) {
          return await route.execute(request);
        }
      }
    }
    catch (error) {
      if (Http.isHttpError(error)) {
        return Http.respondError(error);
      }
      else {
        Log.printError(error);
        return Http.respondError(Http.createHttpError("Server error", 500));
      }
    }
    return Http.respondError(Http.createHttpError("Not found", 404));
  }

  serve(port) {
    const denoConfig = {
      port: port,
      signal: this.#abortController.signal,
      onListen() {
        Log.log(`Starting server on port ${port}...`);
      }
    };
    if (this.#sslCert !== null && this.#sslKey !== null) {
      denoConfig["cert"] = this.#sslCert;
      denoConfig["key"] = this.#sslKey;
    }
    return Deno.serve(denoConfig, async request => await this.#handleRequest(request));
  }

  /** @experimental */
  async serveAndWatch(port, watchDirs) {
    const denoServer = this.serve(port);
    Log.logJs("Watching paths:", watchDirs);
    const fileWatcher = Deno.watchFs(watchDirs ?? "./");
    for await (const event of fileWatcher) {
      fileWatcher.close();
      Log.logJs("Restarting server due to file changes", event.paths);
      this.stop();
    }
    await denoServer.finished;
  }

}

function hasFunction(object, functionName) {
  return object.hasOwnProperty(functionName) && typeof(object[functionName]) === "function";
}

function isValidRouteObject(object) {
  return hasFunction(object, "execute") && hasFunction(object, "matches");
}