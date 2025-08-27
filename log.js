export default class Log {
  
  static log(message) {
    console.log(new Date().toLocaleTimeString().padEnd(12) + message);
  }

  static printError(error) {
    this.log("Caught error:");
    console.log(error);
  }

  static printTrace() {
    console.trace();
  }

}