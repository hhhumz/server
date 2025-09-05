export class JsDbError extends Error { constructor(...args) {super(...args);} }

export function log(...msg) {
  console.log("[jsdb]", ...msg);
}

export async function xread(path) {
  try {
    const string = await Deno.readTextFile(path);
    return JSON.parse(string);
  }
  catch (error) {
    log("Error reading", error);
  }
  return null;
}

export async function xwrite(path, object) {
  try {
    await Deno.writeTextFile(path, JSON.stringify(object));
  }
  catch (error) {
    log("Error writing", error);
  }
}

export const __SEP = "§";
export function genfid(tableName, fieldName) {
  return tableName + __SEP + fieldName;
}