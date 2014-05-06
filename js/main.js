window.addEventListener("load", function() {

  // if this is being automatically tested, let the tester initiate its own
  // instance of the pad javascript client - don't muck with things by syncing
  // up the text area.
  if (navigator.userAgent.indexOf("PhantomJS") >= 0) {
    return;
  }

  // if this is a real user, sync up the textarea using Pad Javascript Client
  var textArea = document.querySelector("#pad");
  var pad = new Pad({
    getState: function() {
      return {
        text: textArea.value,
        selectionStart: textArea.selectionStart,
        selectionEnd: textArea.selectionEnd,
      };
    },
    setState: function(newState) {
      textArea.value = newState.text;
      var selStart = newState.selectionStart,
          selEnd   = newState.selectionEnd;
      textArea.setSelectionRange(selStart, selEnd);
    },
    docID: document.location.pathname,
  });

  // each time the client types, attempt to propagate it to other users. if
  // there is a pending commit, pad knows to immediately to try commit as soon
  // as the outstanding commit is processed, including all the latest changes.
  textArea.addEventListener("keyup", function() {
    pad.tryCommit();
  });

});
