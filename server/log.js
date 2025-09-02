export default class Log {
  
  static log(message) {
    console.log(getDate() + message);
  }

  static printError(error) {
    this.log("Caught error:");
    console.log(error);
  }

  static printTrace() {
    console.trace();
  }

  static logJs(message, ...m) {
    this.log(message);
    console.log(...m);
  }

}

function getDate() {
  return new Date().toLocaleTimeString().padEnd(12);
}