// web worker responsible for heavy lifting of computing diffs. useful because
// off of the UI thread, so delays don't 1) slow down a live interface 2) force
// the UI to be locked for a long time.

var state = {
  headContent: "",
  commits: [{
    parent: null,
    diff: [],
  }],
  clientID: + new Date(),
  pendingUpdates: [],
  isUpdating: false,
};

// commits diff from headContent to newContent and sends it to the server.
// parent is included because pending live updates makes the use of head()
// inconsistent.
function commitAndPush(newContent, parent) {
  var diff = getDiff(state.headContent, newContent);
  var commit = {
    clientID: state.clientID,
    parent: parent,
    diff: diff,
  };
  postMessage({
    type: "ajax",
    data: {
      "doc-id": location.pathname,
      "diff": JSON.stringify(commit),
    },
  });
}

// continuously tries to establish connection and apply served updates
function startContinuousPull() {
  var addr = "ws://";
  addr += location.hostname;
  addr += ":" + location.port
  addr += "/diffs/get";
  var conn = new WebSocket(addr);
  conn.onopen = function() {
    conn.send(location.pathname);
    conn.send(head() + 1);
  };
  conn.onclose = function(evt) {
    setTimeout(startContinuousPull, 1000);
  };
  conn.onmessage = function(evt) {
    var commit = JSON.parse(evt.data);
    state.pendingUpdates.push(commit);
    tryNextUpdate();
  };
}

// if not already trying to update and queued updates from the server exist,
// pops the next one off and ensures it is eventually pushed the UI.
function tryNextUpdate() {

  // ignore if in the middle of an update or there are no updates to apply
  if (state.isUpdating || state.pendingUpdates.length == 0) {
    return;
  }

  // "locK" by marking isUpdating as true, get the next queued commit and rebase
  // it to head. note, fastForward actually adds it to the list of commits,
  // making head() dangerous to use.
  state.isUpdating = true;
  var commit = state.pendingUpdates.shift();
  fastForward(commit);

  // now in an inconsistent state, but it's protected by isPending. headContent
  // is as of head() - 1, because we've added the new commit to commits but did
  // NOT updating headContent.
  //
  // now we kick off a back and forth between main and this worker, which only
  // ends when main accepts a live update. at that point, the logic in the
  // handler should update headContent, release isUpdating, and try again.

  if (commit.clientID == state.clientID) {
    // because this commit actually originated from this client, it's been
    // rebasing it's local changes for every commit up to this point, so there
    // is no need to modify the UI at all! simply yet the UI know so it can try
    // another commit and have an up to date head.
    advanceHeadState();
    state.isUpdating = false;
    postMessage({
      type: "commit-received",
      head: head(),
    });
    tryNextUpdate();
  } else {
    // this commit came from a different client, so its changes have yet to be
    // reflected in the UI. initiate the messaging back and forth; the rest of
    // the logic is in the message handlers.
    postMessage({
      type: "get-live-state",
    });
  }
}

// replays commit over history and adds to commits. does NOT update head state.
function fastForward(commit) {
  // make this diff relevant for the current HEAD
  var newDiff = commit.diff;
  postMessage({
    type: "print",
    val: "this diff" + JSON.stringify(newDiff),
  })
  for (var i = commit.parent + 1; i <= head(); i += 1) {
    newDiff = rebase(state.commits[i].diff, newDiff);
  };
  postMessage({
    type: "print",
    val: "is now this diff" + JSON.stringify(newDiff),
  })
  var newCommit = {
    clientID: commit.clientID,
    parent: head(),
    diff: newDiff,
  };
  state.commits.push(newCommit);
  return newCommit;

}

// adjust head state to reflect the latest diff. now head() is reasonable again.
function advanceHeadState() {
  var diff = state.commits[state.commits.length - 1].diff;
  var newHeadContent = applyDiff(state.headContent, diff);
  state.headContent = newHeadContent;
}

// given data containing the latest state of the UI, rebase the changes since
// the last commit reflected in the UI ontop the result of applying the next
// commit from the server, and send to the UI. the UI will reply back with a
// response, either accepting or rejecting it. this response is handled
// separately.
//
// note: the location of the selection is handled by including two null
// characters, one for the start and one for the end. therefore, their locations
// are preserved relative to the characters. the only tricky part is that if a
// region a cursor was in was deleted, the cursor position must still remain.
// therefore, rebase was modified to include an additional insert of a cursor
// into the correct location in the event this happens.
function tryUpdateMain(data) {
  var currentContent = data.content;
  var selectionStart = data.selectionStart;
  var selectionEnd = data.selectionEnd;
  currentContent = currentContent.substring(0, selectionStart) + "\x00" +
                   currentContent.substring(selectionStart, selectionEnd) +
                   "\x00" + currentContent.substring(selectionEnd);
  var newDiff = state.commits[state.commits.length - 1].diff;
  var localDiff = getDiff(state.headContent, currentContent);
  var newLocalDiff = rebase(newDiff, localDiff);
  var newHeadContent = applyDiff(state.headContent, newDiff);
  var newContent = applyDiff(newHeadContent, newLocalDiff);
  var newCursorStart = newContent.indexOf("\x00");
  var newCursorEnd = newContent.lastIndexOf("\x00") - 1;
  newContent = newContent.replace("\x00", "");
  newContent = newContent.replace("\x00", "");
  postMessage({
    type: "live-update",
    oldContent: data.content,
    newContent: newContent,
    oldSelectionStart: data.selectionStart,
    oldSelectionEnd: data.selectionEnd,
    newSelectionStart: newCursorStart,
    newSelectionEnd: newCursorEnd,
    head: head(),
  });
}

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


  // collapse adjacent
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
    // we want to ignore any inserts contained strictly in the bounds we
    // also want to ignore any delets contained *strictly* in the bounds
    // we want to modify partially overlapping deletes
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

// get the index of the latest commit
function head() {
  return state.commits.length - 1;
};

// handle messages sent from main
onmessage = function(evt) {
  var data = evt.data;
  if (data.type == "commit") {

    // main is sending its current state to create a commit and send to the
    // server. this attempt could be rejected if the diff is empty, or this web
    // worker is currently updating the UI, which could lead to inconsistent
    // commits. rejecting still sends back a "commit-received" message, freeing
    // main to try again. accepting a commit means it will be sent to the server
    // and commit-received will be sent once the commit is received back from
    // the server and processed as the latest commit.
    if (data.content == state.headContent ||
        state.isPending ||
        data.parent != head()) {
      postMessage({
        type: "commit-received",
      });
    } else {
      commitAndPush(data.content, data.parent);
    }

  } else if (data.type == "live-state") {

    // this web worker is in the middle of trying to push an update to the UI,
    // so the current state of the UI was requested so it can be adjusted to
    // incorporate these changes.
    tryUpdateMain(data);

  } else if (data.type == "live-update-response") {

    // main has either accepted or rejected the latest "live-update" attempt to
    // incorporate the latest commit into the UI.
    if (data.success) {
      // main has accepted it, so the commit can be finally processed completely
      // and the next update processed.
      advanceHeadState();
      state.isUpdating = false;
      tryNextUpdate();
    } else {

      // main rejected the last "live-update" because the user made changes in
      // the meantime, so using the "live-update" would lose those changes.
      // therefore, we should request the latest state again, hoping the user is
      // done making changes for a long enough time for the process to work.
      postMessage({
        type: "get-live-state",
      });
    }
  }
}

// initialize websockets which propagate udpates pushed by the server to the UI
startContinuousPull();
