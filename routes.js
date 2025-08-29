import Http from "./http.js";

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

async function serveStaticFile(path) {
  let body;
  const contentType = Http.getMimeTypeFromFileName(path)
  try {
    if (contentType.startsWith("text/")) {
      body = await Deno.readTextFile(Deno.cwd() + path);
    }
    else {
      body = await Deno.readFile(Deno.cwd() + path);
    }
  }
  catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw Http.createHttpError("Not found", 404);
    }
    else {
      throw error;
    }
  }
  return new Response(body, {
    status: 200,
    headers: {"content-type": contentType},
  });
}