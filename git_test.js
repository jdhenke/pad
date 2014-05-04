var git = require("./js/git");
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

  emptyDiff = git.getDiff("", "")
  atobDiff = git.getDiff("a", "b")
  aatobbDiff = git.getDiff("aa", "bb")

  assert.equal(git.applyDiff("", emptyDiff), "")
  assert.equal(git.applyDiff("a", atobDiff), "b")
  assert.equal(git.applyDiff("aa", aatobbDiff), "bb")

  console.log("Basic tests passed")

  abtobaDiff = git.getDiff("ab", "ba")
  assert.equal(git.applyDiff("ab", abtobaDiff), "ba")

  console.log("Secondary tests passed")

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

  atobDiff = git.getDiff("a", "b")
  btocDiff = git.getDiff("b", "c")

  assert.equal(JSONequals(git.rebase(atobDiff, atobDiff), atobDiff))
  assert.equal(JSONequals(git.rebase(atobDiff, btocDiff), btocDiff))

  console.log("All rebase tests passed. ")

}

testGetDiff();
testApplyDiff();
testRebase();
