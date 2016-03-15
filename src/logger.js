const winston = require("winston");
const moment = require("moment");

const colorLevels = {fatal: 0, error: 1, warn: 3, info: 4, debug: 5, trace: 6};
const colors = {fatal: "red", error: "red", warn: "yellow", info: "green", debug: "cyan", trace: "white"};
winston.addColors(colors);
const logger = new (winston.Logger)({
  colors: colors,
  levels: colorLevels,
  transports: [
    new (winston.transports.Console)({
      level: "debug",
      colorize: true,
      timestamp: () => moment().format("YYYY-MM-DD HH:mm:ss.SSS"),
      formatter: options => "[" + options.timestamp() + "] [" + options.level.toUpperCase() + "] " + (undefined !== options.message ? options.message : "") +
          (options.meta && Object.keys(options.meta).length ? ": "+ JSON.stringify(options.meta) : "")
    })
  ]
});

module.exports = logger;
