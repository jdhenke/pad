var git = require("../js/git");
var assert = require('assert');

var testGetAndApplyDiff = function() {

  console.log("********** testGetAndApplyDiff **********")

  function makeString(length) {
    var output = "";
    var source = "abcdefghijklnnopqrstuwxyz";
    for (var i = 0; i < length ; i += 1) {
      output += source.charAt(Math.floor(Math.random() * source.length));
    }
    return output;
  }

  for (var i = 0; i < 100; i += 1) {
    var a = makeString(i);
    var b = makeString(i);
    assert.equal(git.applyDiff(a, git.getDiff(a,b)), b);
  }

  // Set up a performance benchmark
  var a = Array(101).join("a");
  var b = Array(101).join("ba");

  var diff_ab = []
  for (var i = 0; i < 100; i++) {
    diff_ab.push({ type: 'Insert', index: i, val:'b'})
  }

  var emptyDiff = git.getDiff("", "")
  var atobDiff = git.getDiff("a", "b")
  var aatobbDiff = git.getDiff("aa", "bb")
  var abtobaDiff = git.getDiff("ab", "ba")

  assert.equal(git.applyDiff("", emptyDiff), "")
  assert.equal(git.applyDiff("a", atobDiff), "b")
  assert.equal(git.applyDiff("aa", aatobbDiff), "bb")
  assert.equal(git.applyDiff("ab", abtobaDiff), "ba")

  console.log("Basic tests passed")

  // Set up a performance benchmark
  var a = Array(201).join("a");
  var b = Array(201).join("ba");

  longDiff = git.getDiff(a, b)

  console.time('Performance tests')

  for (var i = 0; i < 100; i += 1) {
    var a = makeString(i);
    var b = makeString(i);
    assert.equal(git.applyDiff(a, git.getDiff(a,b)), b);
  }

  console.timeEnd('Performance tests')

  console.log("All applyDiff tests passed.")

}

var testRebase = function() {

  console.log("********** testRebase *********")

  var runRebase = function(original, a, b) {
    var d1 = git.getDiff(original, a);
    var d2 = git.getDiff(original, b);
    assert.equal(git.applyDiff(original, d1), a);
    assert.equal(git.applyDiff(original, d2), b);
    var d2Prime = git.rebase(d1, d2);
    // only test d1 because d2 is modified in rebase
    assert.equal(git.applyDiff(original, d1), a);
    var intermediateText = git.applyDiff(original, d1);
    assert.equal(intermediateText, a);
    return git.applyDiff(intermediateText, d2Prime)
  }

  assert.equal(runRebase("ab", "ad", "cb"), "cd");

  console.log("Basic tests passed");

  // old insert, new insert

  // New insert after
  assert.equal(runRebase("abcdef", "ab123cdef", "abcd456ef"), "ab123cd456ef");
  // Same index
  assert.equal(runRebase("abcdef", "abc123def", "abc456def"), "abc123456def");
  // New insert before
  assert.equal(runRebase("abcdef", "abcd123ef", "ab456cdef"), "ab456cd123ef");

  // new delete, old insert

  // Old insert before
  assert.equal(runRebase("abc456def", "ab123c456def", "abcdef"), "ab123cdef");
  // Old insert at start
  assert.equal(runRebase("abc456def", "abc123456def", "abcdef"), "abc123def");
  // Old insert in middle
  assert.equal(runRebase("abc456def", "abc412356def", "abcdef"), "abcdef");
  // Old insert at end
  assert.equal(runRebase("abc456def", "abc456123def", "abcdef"), "abc123def");
  // Old insert after
  assert.equal(runRebase("abc456def", "abc456d123ef", "abcdef"), "abcd123ef");

  // old delete, new insert

  // New insert before
  assert.equal(runRebase("abc456def", "abcdef", "ab123c456def"), "ab123cdef");
  // New insert at start
  assert.equal(runRebase("abc456def", "abcdef", "abc123456def"), "abc123def");
  // New insert in middle
  assert.equal(runRebase("abc456def", "abcdef", "abc412356def"), "abcdef");
  // New insert at end
  assert.equal(runRebase("abc456def", "abcdef", "abc456123def"), "abc123def");
  // New insert after
  assert.equal(runRebase("abc456def", "abcdef", "abc456d123ef"), "abcd123ef");

  // old delete, new delete

  // New delete starts & ends before
  assert.equal(runRebase("ab123c456def", "ab123cdef", "abc456def"), "abcdef");
  // New delete starts before and ends @ beginning
  assert.equal(runRebase("abc123456def", "abc123def", "abc56def"), "abcdef");
  // New delete starts before and ends in the middle
  assert.equal(runRebase("abc123456def", "abc123def", "abc6def"), "abcdef");
  // New delete starts before and ends at the end
  assert.equal(runRebase("abc123456def", "abc123def", "abcdef"), "abcdef");
  // New delete starts before and ends after
  assert.equal(runRebase("abc124563def", "abc123def", "abcdef"), "abcdef");

  // New delete starts at the beginning and ends in the middle
  assert.equal(runRebase("abc123456def", "abcdef", "abc456def"), "abcdef");
  // New delete starts at the beginning and ends at the end
  assert.equal(runRebase("abc123456def", "abcdef", "abcdef"), "abcdef");
  // New delete starts at the beginning and ends after
  assert.equal(runRebase("abc123456def", "abc6def", "abcdef"), "abcdef");

  // New delete starts & ends in the middle
  assert.equal(runRebase("abc123456def", "abcdef", "abc126def"), "abcdef");
  // New delete starts in the middle and ends at the end
  assert.equal(runRebase("abc123456def", "abcdef", "abc12def"), "abcdef");
  // New delete starts in the middle and ends after
  assert.equal(runRebase("abc123456def", "abc6def", "abc12def"), "abcdef");

  // New delete starts at the end and ends after
  assert.equal(runRebase("abc123456def", "abc456def", "abc12def"), "abcdef");
  // New delete starts and ends after
  assert.equal(runRebase("abc123456def", "abc3456def", "abc123def"), "abc3def");

  // test when old/new deletes contain multiple opposite operations
  var longString = "start: this is a very long string to start out with. :end";
  var a = "start: :end";
  var b = "start: this is a long bit of text to start out with.";
  assert.equal(runRebase(longString, a, b), "start: ");
  assert.equal(runRebase(longString, b, a), "start: ");

  // test multiple overlapping deletes
  var start = "abcdef";
  var a = "adf";
  var b = "acf";
  assert.equal(runRebase(start, a, b), "af");
  assert.equal(runRebase(start, b, a), "af");

  var start = "acbdefghij";
  var a = "adfj";
  var b = "acgj";
  assert.equal(runRebase(start, a, b), "aj");
  assert.equal(runRebase(start, b, a), "aj");

  console.log("Edge case tests passed")

  console.log("All rebase tests passed. ")

}

testGetAndApplyDiff();
testRebase();
