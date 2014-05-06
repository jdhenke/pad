package pad

// defines functionality to essentially make RPC calls to locally running node
// server to rebase incoming commits and update the current state of the
// document.

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"strings"
)

// these next three functions are exactly what we want

// returns JSON-ified diff
func (ps *PadServer) getDiff(a, b string) string {
	url := "/getDiff"
	body := fmt.Sprintf("{\"a\":%v, \"b\":%v}", a, b)
	return ps.hitNode(url, body)
}

// returns JSON-ified rebased commit c2 over commit c1
func (ps *PadServer) rebase(c1, c2 Commit) Commit {
	url := "/rebase"
	body := fmt.Sprintf("{\"c1\": %v, \"c2\": %v}", c1, c2)
	return Commit(ps.hitNode(url, string(body)))
}

// returns JSON-ified application of commit.diff to text
func (ps *PadServer) applyDiff(text string, commit Commit) string {
	url := "/applyDiff"
	body := fmt.Sprintf("{\"text\":%v, \"commit\": %v}", text, commit)
	return ps.hitNode(url, body)
}

// handles http communication with the server
func (ps *PadServer) hitNode(url, strBody string) string {
	body := strings.NewReader(strBody)
	nodePortNum, _ := strconv.Atoi(ps.port)
	nodePortStr := strconv.Itoa(nodePortNum - 2000)
	res, _ := http.Post("http://localhost:"+nodePortStr+url, "application/json", body)
	rawText, _ := ioutil.ReadAll(res.Body)
	text := string(rawText)
	return text
}
