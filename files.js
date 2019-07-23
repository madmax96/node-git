// Files module
// ------------

const files = {

    // **inRepo()** returns true if the current working directory is
    // inside a repository.
    inRepo: function() {
      return files.gitletPath() !== undefined;
    },

    // **assertInRepo()** throws if the current working directory is not
    // inside a repository.
    assertInRepo: function() {
      if (!files.inRepo()) {
        throw new Error("not a Gitlet repository");
      }
    },

    // **pathFromRepoRoot()** returns `path` relative to the repo root
    pathFromRepoRoot: function(path) {
      return nodePath.relative(files.workingCopyPath(), nodePath.join(process.cwd(), path));
    },

    // **write()** writes `content` to file at `path`, overwriting
    // anything that is already there.
    write: function(path, content) {
      let prefix = require("os").platform() == "win32" ? "." : "/";
      files.writeFilesFromTree(util.setIn({}, path.split(nodePath.sep).concat(content)), prefix);
    },

    // **writeFilesFromTree()** takes `tree` of files as a nested JS obj
    // and writes all those files to disk taking `prefix` as the root of
    // the tree.  `tree` format is: `{ a: { b: { c: "filecontent" }}}`
    writeFilesFromTree: function(tree, prefix) {
      Object.keys(tree).forEach(function(name) {
        let path = nodePath.join(prefix, name);
        if (util.isString(tree[name])) {
          fs.writeFileSync(path, tree[name]);
        } else {
          if (!fs.existsSync(path)) {
            fs.mkdirSync(path, "777");
          }

          files.writeFilesFromTree(tree[name], path);
        }
      });
    },

    // **rmEmptyDirs()** recursively removes all the empty directories
    // inside `path`.
    rmEmptyDirs: function(path) {
      if (fs.statSync(path).isDirectory()) {
        fs.readdirSync(path).forEach(function(c) { files.rmEmptyDirs(nodePath.join(path, c)); });
        if (fs.readdirSync(path).length === 0) {
          fs.rmdirSync(path);
        }
      }
    },

    // **read()** returns the contents of the file at `path` as a
    // string.  It returns `undefined` if the file doesn't exist.
    read: function(path) {
      if (fs.existsSync(path)) {
        return fs.readFileSync(path, "utf8");
      }
    },

    // **gitletPath()** returns a string made by concatenating `path` to
    // the absolute path of the `.gitlet` directory of the repository.
    gitletPath: function(path) {
      function gitletDir(dir) {
        if (fs.existsSync(dir)) {
          let potentialConfigFile = nodePath.join(dir, "config");
          let potentialGitletPath = nodePath.join(dir, ".gitlet");
          if (fs.existsSync(potentialConfigFile) &&
              fs.statSync(potentialConfigFile).isFile() &&
              files.read(potentialConfigFile).match(/\[core\]/)) {
            return dir;
          } else if (fs.existsSync(potentialGitletPath)) {
            return potentialGitletPath;
          } else if (dir !== "/") {
            return gitletDir(nodePath.join(dir, ".."));
          }
        }
      };

      let gDir = gitletDir(process.cwd());
      if (gDir !== undefined) {
        return nodePath.join(gDir, path || "");
      }
    },

    // **workingCopyPath()** returns a string made by concatenating `path` to
    // the absolute path of the root of the repository.
    workingCopyPath: function(path) {
      return nodePath.join(nodePath.join(files.gitletPath(), ".."), path || "");
    },

    // **lsRecursive()** returns an array of all the files found in a
    // recursive search of `path`.
    lsRecursive: function(path) {
      if (!fs.existsSync(path)) {
        return [];
      } else if (fs.statSync(path).isFile()) {
        return [path];
      } else if (fs.statSync(path).isDirectory()) {
        return fs.readdirSync(path).reduce(function(fileList, dirChild) {
          return fileList.concat(files.lsRecursive(nodePath.join(path, dirChild)));
        }, []);
      }
    },

    // **nestFlatTree()** takes `obj`, a mapping of file path strings to
    // content, and returns a nested JS obj where each key represents a
    // sub directory.  This is the opposite of
    // `flattenNestedTree()`<br/>
    // eg `nestFlatTree({ "a/b": "me" }); // => { a: { b: "me" }}`
    nestFlatTree: function(obj) {
      return Object.keys(obj).reduce(function(tree, wholePath) {
        return util.setIn(tree, wholePath.split(nodePath.sep).concat(obj[wholePath]));
      }, {});
    },

    // **flattenNestedTree()** takes `tree`, a nested JS object where
    // each key represents a sub directory and returns a JS object
    // mapping file path strings to content.  This is the opposite of
    // `nestFlatTree()`<br/>
    // eg `flattenNestedTree({ a: { b: "me" }}); // => { "a/b": "me"}`
    flattenNestedTree: function(tree, obj, prefix) {
      if (obj === undefined) { return files.flattenNestedTree(tree, {}, ""); }

      Object.keys(tree).forEach(function(dir) {
        let path = nodePath.join(prefix, dir);
        if (util.isString(tree[dir])) {
          obj[path] = tree[dir];
        } else {
          files.flattenNestedTree(tree[dir], obj, path);
        }
      });

      return obj;
    }
  };

  module.exports = files;
