export default class Http {

  static wrapRequest(request) {
    return new WrappedRequest(request);
  }

  static createHttpError(message, code) {
    return new HttpError(message, code);
  }

  static isHttpError(error) {
    return error instanceof HttpError;
  }

  static respondError(error) {
    if (error instanceof HttpError) {
      return this.respondJson({"message": error.message}, error.code);
    }
    else {
      throw error;
    }
  }

  static respondOk(message) {
    return this.respondJson({"message": message}, 200);
  }

  static respondJson(body, code) {
    return new Response(JSON.stringify(body ?? {}), {
      status: code ?? 200,
      headers: {"content-type": "application/json"},
    });
  }

  static getMimeTypeFromFileName(path) {
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

}

class WrappedRequest {

  #request;
  #path;

  get method() {
    return this.#request.method;
  }

  get path() {
    return this.#path;
  }

  constructor(request) {
    this.#request = request;
    this.#path = decodeURIComponent(new URL(request.url).pathname);
  }

  async getJson() {
    return await this.#request.json();
  }

}

class HttpError extends Error {
  
  #code;
  get code() { return this.#code; }

  constructor(message, code) {
    super(message);
    this.#code = code;
    validateHttpResponseCode(code);
  }

}

function validateHttpResponseCode(code) {
  if (code < 100 || code > 599) {
    throw new RangeError("HTTP response code out of range");
  }
}