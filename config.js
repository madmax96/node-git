// Config module
// -------------

// This code allows the config file at `.gitlet/config` to be read and
// written.


const Files = require('./files');
const Util = require('./util');

const Config = {

  // **isBare()** returns true if the repository is bare.
  isBare() {
    return Config.read().core[''].bare === 'true';
  },

  // **assertNotBare()** throws if the repository is bare.
  assertNotBare() {
    if (Config.isBare()) {
      throw new Error('this operation must be run in a work tree');
    }
  },

  // **read()** returns the contents of the config file as a nested JS
  // object.
  read() {
    return Config.strToObj(Files.read(Files.gitletPath('config')));
  },

  // **write()** stringifies the nested JS object `configObj` and
  // overwrites the config file with it.
  write(configObj) {
    Files.write(Files.gitletPath('config'), Config.objToStr(configObj));
  },

  // **strToObj()** parses the config string `str` and returns its
  // contents as a nested JS object.
  strToObj(str) {
    return str.split('[')
      .map(item => item.trim())
      .filter(item => item !== '')
      .reduce((c, item) => {
        const lines = item.split('\n');
        const entry = [];

        // section eg "core"
        entry.push(lines[0].match(/([^ \]]+)( |\])/)[1]);

        // eg "master"
        const subsectionMatch = lines[0].match(/\"(.+)\"/);
        const subsection = subsectionMatch === null ? '' : subsectionMatch[1];
        entry.push(subsection);

        // options and their values
        entry.push(lines.slice(1).reduce((s, l) => {
          s[l.split('=')[0].trim()] = l.split('=')[1].trim();
          return s;
        }, {}));

        return Util.setIn(c, entry);
      }, { remote: {} });
  },

  // **objToStr()** `configObj` is a JS object that holds the config
  // for the repository.  `objToStr()` stringifies the object and
  // returns the string.
  objToStr(configObj) {
    return Object.keys(configObj)
      .reduce((arr, section) => arr.concat(
        Object.keys(configObj[section])
          .map(subsection => ({ section, subsection })),
      ), [])
      .map((entry) => {
        const subsection = entry.subsection === '' ? '' : ` "${entry.subsection}"`;
        const settings = configObj[entry.section][entry.subsection];
        return `[${entry.section}${subsection}]\n${
          Object.keys(settings)
            .map(k => `  ${k} = ${settings[k]}`)
            .join('\n')}\n`;
      })
      .join('');
  },
};

module.exports = Config;
