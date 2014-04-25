package main

// illustrates how a Go program can interface with our node server to use its
// git utility function RPCs.

import (
  "fmt"
  "net/http"
  "strings"
  "io/ioutil"
)

func main() {

  // play with these!!! NOTE: the must have quotes in the string on each side!
  start := "\"joe henke\""
  userA := "\"joseph henke\""
  userB := "\"joe dalton henke\""

  // go through progression of rebasing start->userB ontop of start->userA
  d1 := getDiff(start, userA)
  d2 := getDiff(start, userB)
  d2Prime := rebase(d1, d2)
  r1 := applyDiff(start, d1)
  r2 := applyDiff(r1, d2Prime)

  // print out the scenario and progression
  fmt.Println("Doing all this logic from a *Go* client!!!\n")
  fmt.Println("Start:", start)
  fmt.Println("User A:", userA)
  fmt.Println("User B:", userB)
  fmt.Println("Rebasing B's changes onto A's reveals this progression:")
  fmt.Println("\t", start)
  fmt.Println("\t", r1)
  fmt.Println("\t", r2)
}

// these next three functions are exactly what we want

// returns JSON-ified diff
func getDiff(a, b string) string {
  url := "/getDiff"
  body := fmt.Sprintf("{\"a\":%v, \"b\":%v}", a, b)
  return hitNode(url, body)
}

// returns JSON-ified rebased d2 over d1
func rebase(d1, d2 string) string {
  url := "/rebase"
  body := fmt.Sprintf("{\"d1\": %v, \"d2\": %v}", d1, d2)
  return hitNode(url, body)
}

// returns JSON-ified application of diff to text
func applyDiff(text, diff string) string {
  url := "/applyDiff"
  body := fmt.Sprintf("{\"text\":%v, \"diff\": %v}", text, diff)
  return hitNode(url, body)
}

// handles http communication with the server
func hitNode(url, strBody string) string {
  body := strings.NewReader(strBody)
  res, _ := http.Post("http://localhost:7000" + url, "application/json", body);
  rawText, _ := ioutil.ReadAll(res.Body);
  text := string(rawText)
  return text
}
