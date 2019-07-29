// Files module
// ------------
const fs = require('fs');
const Os = require('os');
const nodePath = require('path');
const Util = require('./util');

const Files = {

  // **inRepo()** returns true if the current working directory is
  // inside a repository.
  inRepo() {
    return Files.gitletPath() !== undefined;
  },

  // **assertInRepo()** throws if the current working directory is not
  // inside a repository.
  assertInRepo() {
    if (!Files.inRepo()) {
      throw new Error('not a Gitlet repository');
    }
  },

  // **pathFromRepoRoot()** returns `path` relative to the repo root
  pathFromRepoRoot(path) {
    return nodePath.relative(Files.workingCopyPath(), nodePath.join(process.cwd(), path));
  },

  // **write()** writes `content` to file at `path`, overwriting
  // anything that is already there.
  write(path, content) {
    const prefix = Os.platform() === 'win32' ? '.' : '/';
    Files.writeFilesFromTree(Util.setIn({}, path.split(nodePath.sep).concat(content)), prefix);
  },

  // **writeFilesFromTree()** takes `tree` of files as a nested JS obj
  // and writes all those files to disk taking `prefix` as the root of
  // the tree.  `tree` format is: `{ a: { b: { c: "filecontent" }}}`
  writeFilesFromTree(tree, prefix) {
    Object.keys(tree).forEach((name) => {
      const path = nodePath.join(prefix, name);
      if (Util.isString(tree[name])) {
        fs.writeFileSync(path, tree[name]);
      } else {
        if (!fs.existsSync(path)) {
          fs.mkdirSync(path, '777');
        }

        Files.writeFilesFromTree(tree[name], path);
      }
    });
  },

  // **rmEmptyDirs()** recursively removes all the empty directories
  // inside `path`.
  rmEmptyDirs(path) {
    if (fs.statSync(path).isDirectory()) {
      fs.readdirSync(path).forEach((c) => { Files.rmEmptyDirs(nodePath.join(path, c)); });
      if (fs.readdirSync(path).length === 0) {
        fs.rmdirSync(path);
      }
    }
  },

  // **read()** returns the contents of the file at `path` as a
  // string.  It returns `undefined` if the file doesn't exist.
  read(path) {
    if (fs.existsSync(path)) {
      return fs.readFileSync(path, 'utf8');
    }
  },

  // **gitletPath()** returns a string made by concatenating `path` to
  // the absolute path of the `.gitlet` directory of the repository.
  gitletPath(path = '') {
    function gitletDir(dir) {
      if (fs.existsSync(dir)) {
        const potentialConfigFile = nodePath.join(dir, 'config');
        const potentialGitletPath = nodePath.join(dir, '.gitlet');
        if (fs.existsSync(potentialConfigFile)
              && fs.statSync(potentialConfigFile).isFile()
              && Files.read(potentialConfigFile).match(/\[core\]/)) {
          return dir;
        }
        if (fs.existsSync(potentialGitletPath)) {
          return potentialGitletPath;
        }
        if (dir !== '/') {
          return gitletDir(nodePath.join(dir, '..'));
        }
      }
    }

    const gDir = gitletDir(process.cwd());
    if (gDir !== undefined) {
      return nodePath.join(gDir, path);
    }
  },

  // **workingCopyPath()** returns a string made by concatenating `path` to
  // the absolute path of the root of the repository.
  workingCopyPath(path = '') {
    return nodePath.join(nodePath.join(Files.gitletPath(), '..'), path);
  },

  // **lsRecursive()** returns an array of all the files found in a
  // recursive search of `path`.
  lsRecursive(path) {
    if (!fs.existsSync(path)) {
      return [];
    }
    if (fs.statSync(path).isFile()) {
      return [path];
    }
    if (fs.statSync(path).isDirectory()) {
      return fs.readdirSync(path)
        .reduce((fileList, dirChild) => fileList
          .concat(Files.lsRecursive(nodePath.join(path, dirChild))), []);
    }
  },

  // **nestFlatTree()** takes `obj`, a mapping of file path strings to
  // content, and returns a nested JS obj where each key represents a
  // sub directory.  This is the opposite of
  // `flattenNestedTree()`<br/>
  // eg `nestFlatTree({ "a/b": "me" }); // => { a: { b: "me" }}`
  nestFlatTree(obj) {
    return Object.keys(obj)
      .reduce((tree, wholePath) => Util
        .setIn(tree, wholePath
          .split(nodePath.sep)
          .concat(obj[wholePath])), {});
  },

  // **flattenNestedTree()** takes `tree`, a nested JS object where
  // each key represents a sub directory and returns a JS object
  // mapping file path strings to content.  This is the opposite of
  // `nestFlatTree()`<br/>
  // eg `flattenNestedTree({ a: { b: "me" }}); // => { "a/b": "me"}`
  flattenNestedTree(tree, obj, prefix) {
    if (obj === undefined) { return Files.flattenNestedTree(tree, {}, ''); }

    Object.keys(tree).forEach((dir) => {
      const path = nodePath.join(prefix, dir);
      if (Util.isString(tree[dir])) {
        obj[path] = tree[dir];
      } else {
        Files.flattenNestedTree(tree[dir], obj, path);
      }
    });

    return obj;
  },
};

module.exports = Files;
