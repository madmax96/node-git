// Index module
// ------------

// The index maps files to hashes of their content.  When a commit is
// created, a tree is built that mirrors the content of the Index.

// Index entry keys are actually a `path,stage` combination.  Stage is
// always `0`, unless the entry is about a file that is in conflict.
// See `Index.writeConflict()` for more details.
const fs = require('fs');
const Files = require('./files');
const Objects = require('./objects');
const Util = require('./util');

const Index = {
  // **hasFile()** returns true if there is an entry for `path` in the
  // index `stage`.
  hasFile(path, stage) {
    return Index.read()[Index.key(path, stage)] !== undefined;
  },

  // **read()** returns the index as a JS object.
  read() {
    const indexFilePath = Files.gitletPath('index');
    return Util.lines(fs.existsSync(indexFilePath) ? Files.read(indexFilePath) : '\n')
      .reduce((idx, blobStr) => {
        const blobData = blobStr.split(/ /);
        idx[Index.key(blobData[0], blobData[1])] = blobData[2];
        return idx;
      }, {});
  },

  // **key()** returns an index key made from `path` and `stage`.
  key(path, stage) {
    return `${path},${stage}`;
  },

  // **keyPieces()** returns a JS object that contains the path and
  // stage of 'key`.
  keyPieces(key) {
    const pieces = key.split(/,/);
    return { path: pieces[0], stage: parseInt(pieces[1]) };
  },

  // **toc()** returns an object that maps file paths to hashes of
  // their content.  This function is like `read()`, except the JS
  // object it returns only uses the file path as a key.
  toc() {
    const idx = Index.read();
    return Object.keys(idx)
      .reduce((obj, k) => Util.setIn(obj, [k.split(',')[0], idx[k]]), {});
  },

  // **isFileInConflict()** returns true if the file for `path` is in
  // conflict.
  isFileInConflict(path) {
    return Index.hasFile(path, 2);
  },

  // **conflictedPaths()** returns an array of all the paths of files
  // that are in conflict.
  conflictedPaths() {
    const idx = Index.read();
    return Object.keys(idx)
      .filter(k => Index.keyPieces(k).stage === 2)
      .map(k => Index.keyPieces(k).path);
  },

  // **writeNonConflict()** sets a non-conflicting index entry for the
  // file at `path` to the hash of `content`.  (If the file was in
  // conflict, it is set to be no longer in conflict.)
  writeNonConflict(path, content) {
    // Remove all keys for the file from the Index.
    Index.writeRm(path);

    // Write a key for `path` at stage `0` to indicate that the
    // file is not in conflict.
    Index._writeStageEntry(path, 0, content);
  },

  // **writeConflict()** sets an index entry for the file
  // at `path` that indicates the file is in conflict after a merge.
  // `receiverContent` is the version of the file that is being merged
  // into. `giverContent` is the version being merged in.
  // `baseContent` is the version that the receiver and
  // giver both descended from.
  writeConflict(path, receiverContent, giverContent, baseContent) {
    if (baseContent !== undefined) {
      // Write a key for `path` at stage `1` for `baseContent`.
      // (There is no `baseContent` if the same file was added for the
      // first time by both versions being merged.)
      Index._writeStageEntry(path, 1, baseContent);
    }

    // Write a key for `path` at stage `2` for `receiverContent`.
    Index._writeStageEntry(path, 2, receiverContent);

    // Write a key for `path` at stage `3` for `giverContent`.
    Index._writeStageEntry(path, 3, giverContent);
  },

  // **writeRm()** removes the index entry for the file at `path`.
  // The file will be removed from the index even if it is in
  // conflict.  (See `Index.writeConflict()` for more information on
  // conflicts.)
  writeRm(path) {
    const idx = Index.read();
    [0, 1, 2, 3].forEach((stage) => { delete idx[Index.key(path, stage)]; });
    Index.write(idx);
  },

  // **_writeStageEntry()** adds the hashed `content` to the index at
  // key `path,stage`.
  _writeStageEntry(path, stage, content) {
    const idx = Index.read();
    idx[Index.key(path, stage)] = Objects.write(content);
    Index.write(idx);
  },

  // **write()** takes a JS object that represents an index and writes
  // it to `.gitlet/index`.
  write(index) {
    const indexStr = `${Object.keys(index)
      .map(k => `${k.split(',')[0]} ${k.split(',')[1]} ${index[k]}`)
      .join('\n')}\n`;
    Files.write(Files.gitletPath('index'), indexStr);
  },

  // **workingCopyToc()** returns an object that maps the file paths
  // in the working copy to hashes of those files' content.
  workingCopyToc() {
    return Object.keys(Index.read())
      .map(k => k.split(',')[0])
      .filter(p => fs.existsSync(Files.workingCopyPath(p)))
      .reduce((idx, p) => {
        idx[p] = Util.hash(Files.read(Files.workingCopyPath(p)));
        return idx;
      }, {});
  },

  // **tocToIndex()** takes an object that maps file paths to hashes
  // of the files' content.  It returns an object that is identical,
  // except the keys of the object are composed of the file paths and
  // stage `0`.  eg: `{ "file1,0": hash(1), "src/file2,0": hash(2) }'
  tocToIndex(toc) {
    return Object.keys(toc)
      .reduce((idx, p) => Util.setIn(idx, [Index.key(p, 0), toc[p]]), {});
  },

  // **matchingFiles()** returns all the paths in the index that match
  // `pathSpec`.  It matches relative to `currentDir`.
  matchingFiles(pathSpec) {
    const searchPath = Files.pathFromRepoRoot(pathSpec);
    return Object.keys(Index.toc())
      .filter(p => p.match(`^${searchPath.replace(/\\/g, '\\\\')}`));
  },
};
module.exports = Index;
