// main script for pad; responsible for propagating changes made by user as
// commits to web worker; responsible for accepting/rejecting changes pushed
// from web worker and atomically updating the UI.

var worker;
var state = {
  head: 0,
  hasPendingCommit: false,
  triedWhilePending: false,
}

// attempts to create a new commit made by local changes from the user. only
// happens if another commit isn't currently pending i.e. hasn't been propogated
// back from the server yet. tracks if an attempt was made while pending and if
// so, immediately tries again after the update is eventually propagated.
function tryCommit() {
  if (state.hasPendingCommit) {
    state.triedWhilePending = true;
    return;
  }
  state.hasPendingCommit = true;
  state.triedWhilePending = false;
  var liveState = {
    type: "commit",
    content: $("#pad").val(),
    parent: state.head,
  };
  worker.postMessage(liveState);
}

// on page load, register listeners and establish the web worker to do the heavy
// lifting of handling.
$(function() {
  $("#pad").keyup(tryCommit);
  $("#pad").focus();
  worker = new Worker("/js/worker.js");
  worker.onmessage = function(evt) {
    var data = evt.data;
    if (data.type == "commit-received") {

      // the webworker has signalled the latest commit has been either ignored
      // or sent and received back from the server.

      //in either case, the commit  is no longer pending.
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
        tryCommit();
      }

    } else if (data.type == "get-live-state") {

      // the web worker is requesting the live state so it can attempt to move
      // the UI forward one commit. sent it both the content and the selection
      // bounds, so it can update everything.
      worker.postMessage({
        type: "live-state",
        content: $("#pad").val(),
        selectionStart: $("#pad")[0].selectionStart,
        selectionEnd: $("#pad")[0].selectionEnd,
      });

    } else if (data.type == "live-update") {

      // the web worker has asynchronously calculated the new state to use in
      // the UI, including the content and cursor positions. However, it must be
      // checked that the state has not changed in the meantime so no user
      // actions are lost.
      //
      // a check is done outside the locking of the UI to avoid interrupting the
      // user while they are potentially typing. if that passes, then the UI is
      // locked and a full check is done. if the state matches the state the web
      // worker based its work off of, it updates the UI's content and selection
      // and adjusts main's head to reflect that the latest change should be off
      // of a new commit. lastly, the UI is unlocked and the web worked notified
      // of the outcome.
      var p = $("#pad")[0];
      if (p.value == data.oldContent) {
        $("#pad").attr("disabled", "disabled");
        var success = false;
        if (p.value == data.oldContent &&
            p.selectionStart == data.oldSelectionStart &&
            p.selectionEnd == data.oldSelectionEnd) {
          success = true;
          state.head = data.head;
          $("#pad").val(data.newContent);
          p.setSelectionRange(data.newSelectionStart,
                              data.newSelectionEnd);
        }
        $("#pad").removeAttr("disabled");
        worker.postMessage({
          type: "live-update-response",
          success: success,
        });
      }

    } else if (data.type == "ajax") {

      // ajax calls are a pain without jQuery and jQuery's a pain in the web
      // worker, so data used for ajax calls is sent here and jquery is used to
      // perform the request.
      $.ajax({
        url: "/diffs/put",
        type: "PUT",
        data: data.data,
        success: function(e) {
        },
        error: function(e) {
          console.log(e.responseText);
        }
      });

    }
  };
});
