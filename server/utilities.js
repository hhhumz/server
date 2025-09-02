import Http from "./http.js";

export class Args {
  
  static has(name) {
    for (const arg of Deno.args) {
      if (arg === name || arg.startsWith(name + "=")) {
        return true;
      }
    }
    return false;
  }

  static get(name, defaultValue, type) {
    let value = defaultValue;
    try {
      const _type = type ?? "string";
      for (const arg of Deno.args) {
        if (arg.startsWith(name + "=")) {
          value = arg.substring(name.length + 1);
          if (_type === "integer") {
            value = parseInt(value);
          }
        }
      }
    }
    catch (_) {
      value = defaultValue;
    }
    return value;
  }

}

export async function serveStaticFile(path) {
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