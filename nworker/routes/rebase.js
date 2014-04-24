var express = require('express');
var router = express.Router();

/* POST commit, response is merged version */
router.post('/', function(req, res) {

  console.log("got here")

  var d1 = req.body.d1
  var d2 = req.body.d2

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

  console.log("got here")
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
  res.send(output);

});

module.exports = router;
