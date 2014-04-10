package main

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"sync"
	"time"
)

var _ = fmt.Printf
var _ = time.Sleep

type PadServer struct {
	docs map[string]*Doc
	mu   sync.Mutex
}

type Doc struct {
	diffs []Diff
	mu sync.Mutex
	listeners []chan Diff
}

type Diff string

// PAD SERVER

func MakePadServer() *PadServer {
	ps := &PadServer{}
	ps.docs = make(map[string]*Doc)
	return ps
}

// DOC

func NewDoc() *Doc {
	doc := &Doc{}
	doc.diffs = make([]Diff, 1)
	doc.listeners = make([]chan Diff, 0)
	return doc
}

func (doc *Doc) getDiff(id int) chan Diff {
	doc.mu.Lock()
	defer doc.mu.Unlock()
	c := make(chan Diff, 1)
	if (id < len(doc.diffs)) {
		c <- doc.diffs[id]
	} else {
		doc.listeners = append(doc.listeners, c)
	}
	return c
}

func (doc *Doc) putDiff(diff Diff) {
	doc.mu.Lock()
	defer doc.mu.Unlock()
	for _, c := range doc.listeners {
		c <- diff
	}
	doc.listeners = make([]chan Diff, 0)
	doc.diffs = append(doc.diffs, diff)
}

// HANDLERS

func (ps *PadServer) diffPutter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	docID := r.PostFormValue("doc-id")
	diff := Diff(r.PostFormValue("diff"))
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = NewDoc()
		doc = ps.docs[docID]
	}
	doc.putDiff(diff)
}

func (ps *PadServer) diffGetter(ws *websocket.Conn) {
	var docID string
	websocket.Message.Receive(ws, &docID)
	var msg string
	websocket.Message.Receive(ws, &msg)
	nextDiff, _ := strconv.Atoi(msg)

	ps.mu.Lock()
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = NewDoc()
		doc = ps.docs[docID]
	}
	ps.mu.Unlock()

	for {
		c := doc.getDiff(nextDiff)
		diff := <- c
		err := websocket.Message.Send(ws, string(diff))
		if err != nil {
			return
		}
		nextDiff += 1
	}
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
	http.Handle("/diffs/get", websocket.Handler(ps.diffGetter))
	http.HandleFunc("/docs/", ps.docHandler)
	http.Handle("/js/", http.FileServer(http.Dir("./")))
	http.ListenAndServe(":8080", nil)
}

func main() {
	ps := MakePadServer()
	ps.Start()
}
