// Index module
// ------------

// The index maps files to hashes of their content.  When a commit is
// created, a tree is built that mirrors the content of the index.

// Index entry keys are actually a `path,stage` combination.  Stage is
// always `0`, unless the entry is about a file that is in conflict.
// See `index.writeConflict()` for more details.

const index = {

    // **hasFile()** returns true if there is an entry for `path` in the
    // index `stage`.
    hasFile: function(path, stage) {
      return index.read()[index.key(path, stage)] !== undefined;
    },

    // **read()** returns the index as a JS object.
    read: function() {
      let indexFilePath = files.gitletPath("index");
      return util.lines(fs.existsSync(indexFilePath) ? files.read(indexFilePath) : "\n")
        .reduce(function(idx, blobStr) {
          let blobData = blobStr.split(/ /);
          idx[index.key(blobData[0], blobData[1])] = blobData[2];
          return idx;
        }, {});
    },

    // **key()** returns an index key made from `path` and `stage`.
    key: function(path, stage) {
      return path + "," + stage;
    },

    // **keyPieces()** returns a JS object that contains the path and
    // stage of 'key`.
    keyPieces: function(key) {
      let pieces = key.split(/,/);
      return { path: pieces[0], stage: parseInt(pieces[1]) };
    },

    // **toc()** returns an object that maps file paths to hashes of
    // their content.  This function is like `read()`, except the JS
    // object it returns only uses the file path as a key.
    toc: function() {
      let idx = index.read();
      return Object.keys(idx)
        .reduce(function(obj, k) { return util.setIn(obj, [k.split(",")[0], idx[k]]); }, {});
    },

    // **isFileInConflict()** returns true if the file for `path` is in
    // conflict.
    isFileInConflict: function(path) {
      return index.hasFile(path, 2);
    },

    // **conflictedPaths()** returns an array of all the paths of files
    // that are in conflict.
    conflictedPaths: function() {
      let idx = index.read();
      return Object.keys(idx)
        .filter(function(k) { return index.keyPieces(k).stage === 2; })
        .map(function(k) { return index.keyPieces(k).path; });
    },

    // **writeNonConflict()** sets a non-conflicting index entry for the
    // file at `path` to the hash of `content`.  (If the file was in
    // conflict, it is set to be no longer in conflict.)
    writeNonConflict: function(path, content) {
      // Remove all keys for the file from the index.
      index.writeRm(path);

      // Write a key for `path` at stage `0` to indicate that the
      // file is not in conflict.
      index._writeStageEntry(path, 0, content);
    },

    // **writeConflict()** sets an index entry for the file
    // at `path` that indicates the file is in conflict after a merge.
    // `receiverContent` is the version of the file that is being merged
    // into. `giverContent` is the version being merged in.
    // `baseContent` is the version that the receiver and
    // giver both descended from.
    writeConflict: function(path, receiverContent, giverContent, baseContent) {
      if (baseContent !== undefined) {
        // Write a key for `path` at stage `1` for `baseContent`.
        // (There is no `baseContent` if the same file was added for the
        // first time by both versions being merged.)
        index._writeStageEntry(path, 1, baseContent);
      }

      // Write a key for `path` at stage `2` for `receiverContent`.
      index._writeStageEntry(path, 2, receiverContent);

      // Write a key for `path` at stage `3` for `giverContent`.
      index._writeStageEntry(path, 3, giverContent);
    },

    // **writeRm()** removes the index entry for the file at `path`.
    // The file will be removed from the index even if it is in
    // conflict.  (See `index.writeConflict()` for more information on
    // conflicts.)
    writeRm: function(path) {
      let idx = index.read();
      [0, 1, 2, 3].forEach(function(stage) { delete idx[index.key(path, stage)]; });
      index.write(idx);
    },

    // **_writeStageEntry()** adds the hashed `content` to the index at
    // key `path,stage`.
    _writeStageEntry: function(path, stage, content) {
      let idx = index.read();
      idx[index.key(path, stage)] = objects.write(content);
      index.write(idx);
    },

    // **write()** takes a JS object that represents an index and writes
    // it to `.gitlet/index`.
    write: function(index) {
      let indexStr = Object.keys(index)
          .map(function(k) { return k.split(",")[0] + " " + k.split(",")[1] + " " + index[k] })
          .join("\n") + "\n";
      files.write(files.gitletPath("index"), indexStr);
    },

    // **workingCopyToc()** returns an object that maps the file paths
    // in the working copy to hashes of those files' content.
    workingCopyToc: function() {
      return Object.keys(index.read())
        .map(function(k) { return k.split(",")[0]; })
        .filter(function(p) { return fs.existsSync(files.workingCopyPath(p)); })
        .reduce(function(idx, p) {
          idx[p] = util.hash(files.read(files.workingCopyPath(p)))
          return idx;
        }, {});
    },

    // **tocToIndex()** takes an object that maps file paths to hashes
    // of the files' content.  It returns an object that is identical,
    // except the keys of the object are composed of the file paths and
    // stage `0`.  eg: `{ "file1,0": hash(1), "src/file2,0": hash(2) }'
    tocToIndex: function(toc) {
      return Object.keys(toc)
        .reduce(function(idx, p) { return util.setIn(idx, [index.key(p, 0), toc[p]]); }, {});
    },

    // **matchingFiles()** returns all the paths in the index that match
    // `pathSpec`.  It matches relative to `currentDir`.
    matchingFiles: function(pathSpec) {
      let searchPath = files.pathFromRepoRoot(pathSpec);
      return Object.keys(index.toc())
        .filter(function(p) { return p.match("^" + searchPath.replace(/\\/g, "\\\\")); });
    }
  };
  module.exports = index;
