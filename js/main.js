$(function() {

  // if this is being automatically tested, let the tester initiate its own
  // instance of the pad javascript client - don't much with things by syncing
  // up the text area.
  if (navigator.userAgent.index("PhantomJS") >= 0) {
    return;
  }

  // if this is a real user, sync up the textarea
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
  textArea.addEventListener("keyup", function() {
    pad.tryCommit();
  });
});
