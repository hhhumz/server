import { Validator } from "../core/api.js";
import { HttpError } from "./server.js";
import { getCookies, setCookie } from "std/http";

// TODO maybe implement some sort of request change logging ?

/** The context in which a server processes and responds to an HTTP request. */
export default class HttpContext {

  #requestPath;
  /** @returns {String} The local path name of the request (e.g. "/index.html") */
  get requestPath() {
    return this.#requestPath;
  }

  #requestMethod;
  /** @returns {String} The request method (e.g. "GET", "POST") */
  get requestMethod() {
    return this.#request.method;
  }

  #request;
  /** @type {Request} The incoming Request. */
  get request() {
    return this.#request;
  }

  #response = null;
  /** @type {Response} The Response to be sent, or null if none has been set yet. */
  get response() {
    return this.#response;
  }

  #error = null;
  /**
   * @type {Error} The Error thrown by execution of this context, or
   *               null if none has been thrown. Calling any of the
   *               .respond*() methods will also clear the error status.
   */
  get error() {
    return this.#error;
  }

  #ip;
  get ip() {
    return this.#ip;
  }

  /** @type {any} Arbitrary data for this context. */
  data = {};

  #hasJson = false;
  #json = null;
  /** @type {?Object} The parsed JSON object from the request's body, if any. */
  get json() {
    return this.#json;
  }

  #hostname = null;
  get hostname() {
    return this.#hostname;
  }

  #responseCookies = [];
  
  constructor(request, info) {
    if (!(request instanceof Request)) {
      throw new TypeError("Must provide a Request");
    }
    if (info?.remoteAddr?.hostname) {
      this.#ip = decodeURIComponent(info.remoteAddr.hostname);
    }
    else {
      this.#ip = "Unknown IP";
    }
    this.#request = request;
    const url = new URL(request.url);
    this.#requestPath = decodeURIComponent(url.pathname);
    this.#hostname = decodeURIComponent(url.hostname);
  }

  getRequestCookie(key) {
    const requestCookies = getCookies(this.#request.headers);
    if (!(key in requestCookies)) {
      return null;
    }
    else {
      return requestCookies[key];
    }
  }

  setResponseCookie(cookie) {
    this.#responseCookies.push(cookie);
  }

  applyCookies() {
    for (const cookie of this.#responseCookies) {
      setCookie(this.#response.headers, cookie);
    }
  }

  async loadJson() {
    try {
      const json = await this.#request.json();
      this.#json = json;
      this.#hasJson = true;
    }
    catch (_) {
      // Do nothing
    }
  }

  /** Returns an object that can validate this request's JSON body with chained assertions. */
  validateJson() {
    return new Validator(this.#json);
  }

  /**
   * Sets the response.
   * This will clear the previous error state.
   * @param {Response} response
   */
  respond(response) {
    this.#response = response;
    this.#error = null;
  }

  /**
   * Sets the response to contain JSON.
   * This will clear the previous error state.
   * @param {Object} body The response body to be serialized as JSON.
   * @param {?number} statusCode The HTTP status code for the response; 200 by default.
   */
  respondJson(body, statusCode) {
    if (!statusCode || statusCode < 100 || statusCode > 599) {
      statusCode = 200;
    }
    this.respond(new Response(JSON.stringify(body ?? {}), {
      status: statusCode,
      headers: this.getHeaders({"content-type": "application/json"}),
    }));
  }

  /**
   * Sets the response to contain a file. If the content type is not specified,
   * it is inferred from the filename.
   * This will clear the previous error state.
   * @param {string} path The full path to the file (e.g Deno.cwd() + "/index.html")
   * @param {?string} contentType The "content-type" header to set (e.g. "text/html")
   */
  async respondStaticFile(path, contentType) {
    let body;
    if (!contentType) {
      contentType = getMimeTypeFromFileName(path);
    }
    try {
      if (contentType.startsWith("text/")) {
        body = await Deno.readTextFile(path);
      }
      else {
        body = await Deno.readFile(path);
      }
    }
    catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new HttpError("Not Found", 404);
      }
    }
    this.respond(new Response(body, {
      status: 200,
      headers: this.getHeaders({"content-type": contentType}),
    }));
  }

  setError(error) {
    this.#error = error;
  }

  getHeaders(otherHeadersPlainObj) {
    otherHeadersPlainObj["Referrer-Policy"] = "same-origin";
    otherHeadersPlainObj["Strict-Transport-Security"] = "max-age=2000000; includeSubDomains"; 
    otherHeadersPlainObj["X-Frame-Options"] = "DENY";
    otherHeadersPlainObj["X-Content-Type-Options"] = "nosniff";
    let csp = "frame-ancestors 'none'; img-src 'self'; script-src 'self'";
    if (this.#hostname !== "localhost") {
      // csp += "; style-src 'self'; default-src 'self'";
    }
    otherHeadersPlainObj ["Content-Security-Policy"] = csp;
    return otherHeadersPlainObj;
  }

}

function getMimeTypeFromFileName(path) {
  const split = path.split(".");
  const extension = split[split.length - 1];
  let contentType = "text/plain";
  if (extension === "js") {
    contentType = "text/javascript";
  }
  else if (extension === "html") {
    contentType = "text/html";
  }
  else if (extension === "css") {
    contentType = "text/css";
  }
  else if (extension === "json") {
    contentType = "application/json";
  }
  else if (extension === "png") {
    contentType = "image/png";
  }
  else if (extension === "jpg" || extension === "jpeg") {
    contentType = "image/jpeg";
  }
  else if (extension === "gif") {
    contentType = "image/gif";
  }
  else if (extension === "ttf" || extension === "otf") {
    contentType = "font/woff2";
  }
  else if (extension === "svg") {
    contentType = "image/svg+xml";
  }
  return contentType;
}