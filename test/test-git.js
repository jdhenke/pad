var git = require("../js/git");
var assert = require('assert');

// TODO: test git.getDiff, git.rebase, git.applyDiff

// Fast comparison of two JSON-style javascript objects
var JSONequals = function(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2)
}

var testGetDiff = function() {

  console.log("********** testGetDiff **********")

  // Basic tests
  assert(JSONequals(git.getDiff("", ""), []))
  assert(JSONequals(git.getDiff("", "a"), [ { type:'Insert', index: 0, val: 'a' } ]))
  assert(JSONequals(git.getDiff("a", ""), [ { type:'Delete', index: 0, size: 1 } ]))
  assert(JSONequals(git.getDiff("a", "b"),[ { type: 'Delete', index: 0, size: 1 }, { type: 'Insert', index: 1, val: 'b' } ]))

  console.log("Basic tests passed")

  assert(JSONequals(git.getDiff("aba","b"), [ { type: 'Delete', index: 0, size: 1 }, { type: 'Delete', index: 2, size: 1 } ]))
  assert(JSONequals(git.getDiff("b", "aba"), [ { type: 'Insert', index: 0, val: 'a' }, { type: 'Insert', index: 1, val: 'a' } ]))
  assert(JSONequals(git.getDiff("bb", "aabaab"), [ { type: 'Insert', index: 0, val: 'aa' }, { type: 'Insert', index: 1, val: 'aa' } ]))

  console.log("Secondary tests passed")

  // Set up a performance benchmark
  var a = Array(101).join("a");
  var b = Array(101).join("ba");

  var diff_ab = []
  for (var i = 0; i < 100; i++) {
    diff_ab.push({ type: 'Insert', index: i, val:'b'})
  }

  console.time('Performance tests')

  // Execute a 100-insertion getDiff 10 times
  for (var i = 0; i < 10; i++) {
    assert(JSONequals(git.getDiff(a, b), diff_ab))
  }

  console.timeEnd('Performance tests')

  console.log("All getDiff tests passed.")
}

var testApplyDiff = function() {

  console.log("********** testApplyDiff *********")

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

  // Execute a 200-insertion getDiff 100 times
  for (var i = 0; i < 100; i++) {
    assert.equal(git.applyDiff(a, longDiff), b)
  }

  console.timeEnd('Performance tests')

  console.log("All applyDiff tests passed.")

}

var testRebase = function() {

  console.log("********** testRebase *********")

  var runRebase = function(original, a, b) {
    var d1 = git.getDiff(original, a);
    var d2 = git.getDiff(original, b);
    var d2Prime = git.rebase(d1, d2);
    var intermediateText = git.applyDiff(original, d1);
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
  // Old insert in middle **
  assert.equal(runRebase("abc456def", "abc412356def", "abcdef"), "abc356def");
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
  // New delete starts before and ends @ beginning **
  assert.equal(runRebase("abc123456def", "abc123def", "abc56def"), "abcdef");
  // New delete starts before and ends in the middle **
  assert.equal(runRebase("abc123456def", "abc123def", "abc6def"), "abcdef");
  // New delete starts before and ends at the end **
  assert.equal(runRebase("abc123456def", "abc123def", "abcdef"), "abcdef");
  // New delete starts before and ends after **
  assert.equal(runRebase("abc124563def", "abc123def", "abcdef"), "abcdef");
  
  // New delete starts at the beginning and ends in the middle
  assert.equal(runRebase("abc123456def", "abcdef", "abc456def"), "abcdef");
  // New delete starts at the beginning and ends at the end
  assert.equal(runRebase("abc123456def", "abcdef", "abcdef"), "abcdef");
  // New delete starts at the beginning and ends after **
  assert.equal(runRebase("abc123456def", "abc6def", "abcdef"), "abcdef");
  
  // New delete starts & ends in the middle
  assert.equal(runRebase("abc123456def", "abcdef", "abc126def"), "abcdef");
  // New delete starts in the middle and ends at the end
  assert.equal(runRebase("abc123456def", "abcdef", "abc12def"), "abcdef");
  // New delete starts in the middle and ends after **
  assert.equal(runRebase("abc123456def", "abc6def", "abc12def"), "abcdef");

  // New delete starts at the end and ends after **
  assert.equal(runRebase("abc123456def", "abc456def", "abc12def"), "abcdef");
  // New delete starts and ends after
  assert.equal(runRebase("abc123456def", "abc3456def", "abc123def"), "abc3def");

  console.log("Edge case tests passed")

  console.log("All rebase tests passed. ")

}

testGetDiff();
testApplyDiff();
testRebase();
