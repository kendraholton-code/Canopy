/* Node entry point: loads every core file (in order) onto globalThis.Canopy. */
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
files.forEach((f) => require(path.join(__dirname, f)));
module.exports = globalThis.Canopy;
module.exports.FILES = files.map((f) => path.join(__dirname, f));
