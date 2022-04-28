const chalk = require('chalk');

module.exports.appMsg = function (msg) {
  console.log(chalk.magenta(msg));
};
module.exports.yellow = function (msg) {
  console.log(chalk.yellow(msg));
};
module.exports.yellowBright = function (msg) {
  console.log(chalk.yellowBright(msg));
};
module.exports.green = function (msg) {
  console.log(chalk.green(msg));
};
module.exports.blue = function (msg) {
  console.log(chalk.blue(msg));
};
module.exports.error = function (msg) {
  console.log(chalk.red(msg));
};
module.exports.info = function (msg) {
  console.log(chalk.white(msg));
};

