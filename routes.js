import { serveStaticFile } from "./utilities.js";

export class StaticFileRoute {
  
  #routePath;
  #filePath;

  constructor(routePath, filePath) {
    this.#routePath = routePath;
    this.#filePath = filePath;
  }

  matches(request) {
    return request.method === "GET" && request.path === this.#routePath;
  }

  async execute(request) {
    return await serveStaticFile(this.#filePath);
  }

}

export class StaticMountRoute {

  #routePath;
  #mountPoint;

  constructor(routePath, mountPoint) {
    this.#routePath = routePath;
    this.#mountPoint = mountPoint;
  }

  matches(request) {
    return request.method === "GET" && request.path.startsWith(this.#routePath);
  }

  async execute(request) {
    let routedPath = this.#mountPoint + request.path.substring(this.#routePath.length);
    if (routedPath.endsWith("/")) {
      routedPath = routedPath.substring(0, routedPath.length - 1);
    }
    return await serveStaticFile(routedPath);
  }

}