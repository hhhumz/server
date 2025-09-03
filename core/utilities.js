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

export class DefaultLogger {

  log(...args) {
    console.log("[wisp] " + getPaddedDate(), ...args);
  }

}

function getPaddedDate() {
  return new Date().toLocaleTimeString().padEnd(12);
}