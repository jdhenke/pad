package main

import (
	"code.google.com/p/go.net/websocket"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

var _ = fmt.Printf
var _ = time.Sleep

type PadServer struct {
	docs map[string]*Doc
	mu   sync.Mutex
	ppd  *PadPersistenceWorker
}

type Doc struct {
	diffs     []Diff
	mu        sync.Mutex
	listeners []chan Diff
	Id        int64
	Name      string //TODO: Make a Doc metadata structure to store doc identification
}

type Diff string

// PAD SERVER

func MakePadServer() *PadServer {
	ps := &PadServer{}
	ps.docs = make(map[string]*Doc)
	ps.ppd = MakePersistenceWorker(ps)
	ps.ppd.Start()
	return ps
}

// DOC

func NewDoc(docID string) *Doc {
	doc := &Doc{}
	doc.diffs = make([]Diff, 1)
	doc.listeners = make([]chan Diff, 0)
	doc.Id = nrand()
	doc.Name = docID

	// append document identification data to metadata
	fd, _ := os.OpenFile(METADATA, os.O_RDWR|os.O_APPEND, 0644)
	defer fd.Close()
	b, _ := json.Marshal(doc)
	fd.Write(b)

	// create doc file on disk
	os.Create(DOC + strconv.FormatInt(doc.Id, 10) + JSON)

	return doc
}

func (doc *Doc) getDiff(id int) chan Diff {
	doc.mu.Lock()
	defer doc.mu.Unlock()
	c := make(chan Diff, 1)
	if id < len(doc.diffs) {
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
		ps.docs[docID] = NewDoc(docID)
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
		ps.docs[docID] = NewDoc(docID)
		doc = ps.docs[docID]
	}
	ps.mu.Unlock()

	for {
		c := doc.getDiff(nextDiff)
		diff := <-c
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

func nrand() int64 {
	max := big.NewInt(int64(1) << 62)
	bigx, _ := rand.Int(rand.Reader, max)
	x := bigx.Int64()
	return x
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
