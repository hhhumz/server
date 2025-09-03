import HttpContext from "./context.js";

/** @interface */
export class Route {

  /** @param {HttpContext} context */
  matches(context) {

  }

  /** @param {HttpContext} context */
  execute(context) {}

  /**
   * @param {HttpContext} context
   * @param {Error} error
   */
  handleError(context, error) {}

}

/** @implements {Route} */
export class StaticFileRoute {

  #routePath;
  #filePath;

  constructor(routePath, filePath) {
    this.#routePath = routePath;
    this.#filePath = filePath;
  }

  matches(context) {
    return context.requestMethod === "GET" && context.requestPath === this.#routePath;
  }

  async execute(context) {
    return await context.respondStaticFile(Deno.cwd() + this.#filePath);
  }

}

/** @implements {Route} */
export class StaticMountRoute {

  #routePath;
  #mountPoint;

  constructor(routePath, mountPoint) {
    this.#routePath = routePath;
    this.#mountPoint = mountPoint;
  }

  matches(context) {
    return context.requestMethod === "GET" && context.requestPath.startsWith(this.#routePath);
  }

  async execute(context) {
    let routedPath = this.#mountPoint + context.requestPath.substring(this.#routePath.length);
    if (routedPath.endsWith("/")) {
      routedPath = routedPath.substring(0, routedPath.length - 1);
    }
    return await context.respondStaticFile(Deno.cwd() + routedPath);
  }

}