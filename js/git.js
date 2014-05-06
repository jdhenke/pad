// purely functional utility functions for git operations. this file is useable
// to include in a website or a node application. it defines globally/exports as
// attributes of the module: getDiff, rebase, applyDiff

// creates diff from a -> b
function getDiff(a, b) {

  // perform dynamic program to create diff
  var memo = {};

  // dp(i,j) returns operations to transform a[:i] into b[:j]. we return
  // the actual stored object; do not modify it.
  var dp = function(i, j) {

    // check if answer is memoized; if so return it
    var key = i + "," + j;
    if (key in memo) {
      return memo[key];
    }

    // if not compute, store and return it
    var answer;
    if (i == 0 && j == 0) {
      // both documents finished together
      answer = {type: null, cost: 0};
    } else {
      var options = [];
      if (j > 0) {
        var insertResult = dp(i, j-1);
        options.push({
          type: "Insert",
          index: i,
          val: b[j-1],
          cost: insertResult.cost + 1,
          last: insertResult,
        });
      }
      if (i > 0) {
        var deleteResult = dp(i-1, j);
        options.push({
          type: "Delete",
          index: i - 1,
          size: 1,
          cost: deleteResult.cost + 1,
          last: deleteResult,
        });
      }
      if (a[i-1] == b[j-1]) {
        var sameResult = dp(i-1, j-1);
        options.push(sameResult);
      }

      var minOp = options[0];
      for (var k=1; k < options.length; k += 1) {
        if (options[k].cost < minOp.cost) {
          minOp = options[k];
        }
      }
      answer = minOp;
    }

    memo[key] = answer;
    return answer;
  }

  var result = dp(a.length, b.length);
  var ops = [];
  while (result.type != null) {
    var nextResult = result.last;
    delete result.cost;
    delete result.last;
    ops.push(result);
    result = nextResult;
  }
  ops = ops.reverse();


  // collapse adjacent operations of the same kind.
  if (ops.length == 0) {
    return []
  }
  var diff = [];
  var runningOp = ops[0];
  for (var i = 1; i < ops.length; i += 1) {
    if (runningOp.type == "Insert" &&
        ops[i].type == "Insert" &&
        ops[i].index == runningOp.index) {
      runningOp.val += ops[i].val;
    } else if (runningOp.type == "Delete" &&
        ops[i].type == "Delete" &&
        ops[i].index == runningOp.index + runningOp.size) {
      runningOp.size += 1;
    } else {
      diff.push(runningOp);
      runningOp = ops[i];
    }
  }
  diff.push(runningOp);
  return diff;
}

// returns the result of applying diff to content
function applyDiff(content, diff) {
  var index = 0;
  var output = "";
  for (var i = 0; i < diff.length; i += 1) {
    var op = diff[i];
    output += content.substring(index, op.index);
    index = op.index
    if (op.type == "Insert") {
      output += op.val;
    } else if (op.type == "Delete") {
      index += op.size;
    }
  }
  output += content.substring(index, content.length);
  return output;
}

// given two diffs to the same document, return a d2' which captures as many of
// the changes in d2 as possible and can be applied to the document + d1.
// mutates d2. ensures cursor locations, marked by null characters, are not
// deleted, but rather maintained into reasonable locations through deletions.
function rebase(d1, d2) {

  // cumulative state as we iterate through with two fingers
  var i = 0;
  var j = 0;
  var output = [];
  var shift = 0;

  // possible options at each stage

  var doOldInsert = function() {
    shift += d1[i].val.length;
    i += 1;
  }
  var doOldDelete = function() {
    // we want to ignore any inserts contained strictly in the bounds. we also
    // want to ignore any deletes contained *strictly* in the bounds. we want to
    // modify partially overlapping deletes.
    while (j < d2.length && d2[j].index < d1[i].index + d1[i].size) {
      if (d2[j].type == "Insert") {
        // ignore it. account for cursor positions marked with null char.
        var cursorIndex1 = d2[j].val.indexOf("\x00");
        var cursorIndex2 = d2[j].val.lastIndexOf("\x00");
        var insertCursor = function() {
          output.push({
            type: "Insert",
            index: d1[i].index + shift,
            val: "\x00",
          });
        };
        if (cursorIndex1 >= 0) {
          insertCursor();
        }
        if (cursorIndex2 > cursorIndex1) {
          insertCursor();
        }
      } else if (d2[j].type == "Delete") {
        if (d2[j].index + d2[j].size > d1[i].index + d1[i].size) {
          // delete has mismatched overlap
          // OLD: --[--]--
          // NEW: ---[--]-
          //    : --[-]-
          var op = d2[j];
          op.index = d1[i].index + shift;
          op.size = d2[j].index + d2[j].size - d1[i].index + d1[i].size;
          output.push(op);
        } else {
          // delete is completely contained, ignore.
        }
      }
      j += 1;
    }
    shift -= d1[i].size;
    i += 1;
  }
  var doNewInsert = function() {
    var op = d2[j];
    op.index += shift;
    output.push(op);
    j += 1;
  }
  var doNewDelete = function() {
    // we want to adjust this delete's starting index appropriately. we
    // also want to adjust this delete's size based on any ops this delete
    // strictly contains.
    var op = d2[j];
    op.index += shift;
    var originalSize = op.size;
    while (i < d1.size && d1[i].index < op.index + originalSize) {
      if (d1[i].type == "Insert") {
        // need to increase the size to include this insert
        op.size += d1[i].val.length;
        shift += d1[i].val.length;
      } else if (d1[i].type == "Delete") {
        // need to adjust the size to be up to
        // NEW: --[---]--
        // OLD: ---[-]---
        // OLD: ---[---]-
        var smallerRightBoundary = Math.min(op.index + originalSize,
                                            d1[i].index + d1[i].size);
        op.size -= smallerRightBoundar - d1[i].index;
        shift -= d1[i].size;
      }
      i += 1;
    }
    output.push(op);
    j += 1;
  }

  while (i < d1.length && j < d2.length) {
    if (d1[i].index < d2[j].index) {
      if (d1[i].type == "Insert") {
        doOldInsert();
      } else if (d1[i].type == "Delete") {
        doOldDelete();
      }
    } else if (d2[j].index < d1[i].index) {
      if (d2[j].type == "Insert") {
        doNewInsert();
      } else if (d2[j].type == "Delete") {
        doNewDelete();
      }
    } else { // must be equal
      if (d1[i].type == "Insert") {
        doOldInsert();
      } else if (d2[j].type == "Insert") {
        doNewInsert();
      } else if (d1[i].type == "Delete") {
        doOldDelete();
      }
    }
  }
  while (j < d2.length) {
    if (d2[j].type == "Insert") {
      doNewInsert();
    } else if (d2[j].type == "Delete") {
      doNewDelete();
    }
  }
  return output;
}

// export functionality if being used by node
if (typeof module !== 'undefined') {
  module.exports = {
    getDiff: getDiff,
    applyDiff: applyDiff,
    rebase: rebase,
  };
}
