$(function() {
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
