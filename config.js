// Config module
// -------------

// This code allows the config file at `.gitlet/config` to be read and
// written.
const Files = require('./files');

const Config = {

    // **isBare()** returns true if the repository is bare.
    isBare: function() {
      return Config.read().core[""].bare === "true";
    },

    // **assertNotBare()** throws if the repository is bare.
    assertNotBare: function() {
      if (Config.isBare()) {
        throw new Error("this operation must be run in a work tree");
      }
    },

    // **read()** returns the contents of the config file as a nested JS
    // object.
    read: function() {
      return Config.strToObj(Files.read(Files.gitletPath("config")));
    },

    // **write()** stringifies the nested JS object `configObj` and
    // overwrites the config file with it.
    write: function(configObj) {
      Files.write(Files.gitletPath("config"), Config.objToStr(configObj));
    },

    // **strToObj()** parses the config string `str` and returns its
    // contents as a nested JS object.
    strToObj: function(str) {
      return str.split("[")
        .map(function(item) { return item.trim(); })
        .filter(function(item) { return item !== ""; })
        .reduce(function(c, item) {
          let lines = item.split("\n");
          let entry = [];

          // section eg "core"
          entry.push(lines[0].match(/([^ \]]+)( |\])/)[1]);

          // eg "master"
          let subsectionMatch = lines[0].match(/\"(.+)\"/);
          let subsection = subsectionMatch === null ? "" : subsectionMatch[1];
          entry.push(subsection);

          // options and their values
          entry.push(lines.slice(1).reduce(function(s, l) {
            s[l.split("=")[0].trim()] = l.split("=")[1].trim();
            return s;
          }, {}));

          return util.setIn(c, entry);
        }, { "remote": {} });
    },

    // **objToStr()** `configObj` is a JS object that holds the config
    // for the repository.  `objToStr()` stringifies the object and
    // returns the string.
    objToStr: function(configObj) {
      return Object.keys(configObj)
        .reduce(function(arr, section) {
          return arr.concat(
            Object.keys(configObj[section])
              .map(function(subsection) { return { section: section, subsection: subsection }})
          );
        }, [])
        .map(function(entry) {
          let subsection = entry.subsection === "" ? "" : " \"" + entry.subsection +"\"";
          let settings = configObj[entry.section][entry.subsection];
          return "[" + entry.section + subsection + "]\n" +
            Object.keys(settings)
            .map(function(k) { return "  " + k + " = " + settings[k]; })
            .join("\n") + "\n";
        })
        .join("");
    }
  };

  module.exports = Config;
