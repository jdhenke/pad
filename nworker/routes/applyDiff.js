var express = require('express');
var router = express.Router();

/* POST commit, response is merged version */
router.post('/', function(req, res) {
  console.log("method found")
  var content = req.body.content
  var diff = req.body.diff

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
  res.send(output)
});


module.exports = router;
