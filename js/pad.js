function Pad(params) {

  // store given parameters as attributes of this pad client object
  this.docID = params.docID
  this.getState = params.getState
  this.setState = params.setState

  // internal state. worker is the web worker with which this pad client
  // interacts. state is the necessary state of this pad client to keep in the
  // main; the web worker maintains a more detailed state.
  var worker = new Worker("/js/worker.js");
  var state = {
    head: 0,
    hasPendingCommit: false,
    triedWhilePending: false,
  }

  // initialize web worker with the id of this document
  worker.postMessage({
    type: "docID",
    docID: this.docID,
  })

  // establish communication handling with the worker. the convention is for the
  // worker to pass an object with a type, and based on the type, it expects
  // certain other attributes of the object to be defined.
  worker.onmessage = function(evt) {
    var data = evt.data;
    if (data.type == "commit-received") {

      // the webworker has signalled the latest commit has been either ignored
      // or sent and received back from the server. in either case, the commit
      // is no longer pending.
      state.hasPendingCommit = false;

      // if the commit was sent to the server and back, normally, each commit
      // updates main with a "live-update" message. In this case, no UI changes
      // need to be done, but head should still be updated to keep in sync with
      // the web worker. So, data.head is only defined in this case where it is
      // meaningful.
      if (data.head) {
        state.head = data.head;
      }

      // if an attempt was made to commit while the last commit was pending i.e.
      // a user was typing, their may be changes made and if the user stops
      // typing, we still want those changes propagated. therefore, we check
      // this flag and try again if that's the case.
      if (state.triedWhilePending) {
        this.tryCommit();
      }

    } else if (data.type == "get-live-state") {

      // the web worker is requesting the live state so it can attempt to move
      // the UI forward one commit. sent it both the text and the selection
      // bounds, so it can update everything.
      worker.postMessage({
        type: "live-state",
        state: this.getState(),
      });

    } else if (data.type == "live-update") {

      // the web worker has asynchronously calculated the new state to use in
      // the UI, including the text and selection bounds. However, it must be
      // checked that the state has not changed in the meantime so no user
      // actions are lost.
      var success = false;
      var currentState = this.getState();
      var oldState = data.oldState;
      if (oldState.text === currentState.text &&
          oldState.selectionStart == currentState.selectionStart &&
          oldState.selectionEnd == currentState.selectionEnd) {
        success = true;
        state.head = data.head;
        this.setState(data.newState);
      }
      worker.postMessage({
        type: "live-update-response",
        success: success,
      });

    }

  }.bind(this);

  // tries to commit the current state of the document
  this.tryCommit = function() {
    if (state.hasPendingCommit) {
      state.triedWhilePending = true;
      return;
    }
    state.hasPendingCommit = true;
    state.triedWhilePending = false;
    var liveState = {
      type: "commit",
      text: this.getState().text,
      parent: state.head,
    };
    worker.postMessage(liveState);
  };

}
