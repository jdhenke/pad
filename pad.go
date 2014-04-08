package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"sync"
)

var _ = fmt.Printf

type PadServer struct {
	docs map[string]*Doc
	mu   sync.Mutex
}

type Doc struct {
	diffs []Diff
}

type Diff string

// PAD SERVER

func MakePadServer() *PadServer {
	ps := &PadServer{}
	ps.docs = make(map[string]*Doc)
	return ps
}

// HANDLERS

func (ps *PadServer) diffPutter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	docID := r.PostFormValue("doc-id")
	diff := Diff(r.PostFormValue("diff"))
	doc, ok := ps.docs[docID];
	if !ok {
		ps.docs[docID] = &Doc{diffs: make([]Diff, 1)}
		doc = ps.docs[docID]
	}
	doc.diffs = append(doc.diffs, diff)
}

func (ps *PadServer) diffGetter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	docID := r.PostFormValue("doc-id")
	diffID, _ := strconv.Atoi(r.PostFormValue("diff-id"))
	if doc, ok := ps.docs[docID]; ok {
		if diffID < len(doc.diffs) {
			w.Write([]byte(doc.diffs[diffID]))
			return
		}
	}
	http.Error(w, "bad get", http.StatusBadRequest)
}

func (ps *PadServer) docHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Content-Type", "text/html")
	if html, err := ioutil.ReadFile("./index.html"); err == nil {
		w.Write(html)
	} else {
		panic("unknown file")
	}
}

func (ps *PadServer) Start() {
	http.HandleFunc("/diffs/put", ps.diffPutter)
	http.HandleFunc("/diffs/get", ps.diffGetter)
	http.HandleFunc("/docs/", ps.docHandler)
	http.ListenAndServe(":8080", nil)
}

func main() {
	ps := MakePadServer()
	ps.Start()
}
