// web worker responsible for heavy lifting of computing diffs. useful because
// off of the UI thread, so delays don't 1) slow down a live interface 2) force
// the UI to be locked for a long time.

importScripts("/js/git.js");

var state = {
  headText: "",
  commits: [{
    parent: null,
    diff: [],
  }],
  clientID: + new Date(),
  pendingUpdates: [],
  isUpdating: false,
};

// commits diff from headText to newText and sends it to the server.
// parent is included because pending live updates makes the use of head()
// inconsistent.
function commitAndPush(newText, parent) {
  var diff = getDiff(state.headText, newText);
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

  // now in an inconsistent state, but it's protected by isPending. headText
  // is as of head() - 1, because we've added the new commit to commits but did
  // NOT updating headText.
  //
  // now we kick off a back and forth between main and this worker, which only
  // ends when main accepts a live update. at that point, the logic in the
  // handler should update headText, release isUpdating, and try again.

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
  var newHeadtext = applyDiff(state.headText, diff);
  state.headText = newHeadtext;
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
  var currentText = data.text;
  var selectionStart = data.selectionStart;
  var selectionEnd = data.selectionEnd;
  currentText = currentText.substring(0, selectionStart) + "\x00" +
                   currentText.substring(selectionStart, selectionEnd) +
                   "\x00" + currentText.substring(selectionEnd);
  var newDiff = state.commits[state.commits.length - 1].diff;
  var localDiff = getDiff(state.headText, currentText);
  var newLocalDiff = rebase(newDiff, localDiff);
  var newHeadtext = applyDiff(state.headText, newDiff);
  var newText = applyDiff(newHeadtext, newLocalDiff);
  var newSelectionStart = newText.indexOf("\x00");
  var newSelectionEnd = newText.lastIndexOf("\x00") - 1;
  newText = newText.replace("\x00", "");
  newText = newText.replace("\x00", "");
  postMessage({
    type: "live-update",
    oldState: data,
    newState: {
      text: newText,
      selectionStart: newSelectionStart,
      selectionEnd: newSelectionEnd,
    },
    head: head(),
  });
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
    if (data.text == state.headText ||
        state.isPending ||
        data.parent != head()) {
      postMessage({
        type: "commit-received",
      });
    } else {
      commitAndPush(data.text, data.parent);
    }

  } else if (data.type == "live-state") {

    // this web worker is in the middle of trying to push an update to the UI,
    // so the current state of the UI was requested so it can be adjusted to
    // incorporate these changes.
    tryUpdateMain(data.state);

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
