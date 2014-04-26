package main

import (
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
	commits   []Commit
	mu        sync.Mutex
	listeners []chan Commit
	Id        int64
	Name      string //TODO: Make a Doc metadata structure to store doc identification
}

type Commit string

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
	doc.commits = make([]Commit, 1)
	doc.listeners = make([]chan Commit, 0)
	doc.Id = nrand()
	doc.Name = docID

	// append document identification data to metadata
	fd, _ := os.OpenFile(METADATA, os.O_RDWR|os.O_APPEND, 0644)
	defer fd.Close()
	b, _ := json.Marshal(doc)
	fd.Write(b)
	fd.Write([]byte("\n"))

	// create doc file on disk
	os.Create(DOC + strconv.FormatInt(doc.Id, 10) + JSON)

	return doc
}

func (doc *Doc) getCommit(id int) Commit {
	doc.mu.Lock()
	c := make(chan Commit, 1)
	if id < len(doc.commits) {
		c <- doc.commits[id]
	} else {
		doc.listeners = append(doc.listeners, c)
	}
	doc.mu.Unlock()
	return <-c
}

func (doc *Doc) putCommit(commit Commit) {
	doc.mu.Lock()
	defer doc.mu.Unlock()
	for _, c := range doc.listeners {
		c <- commit
	}
	doc.listeners = make([]chan Commit, 0)
	doc.commits = append(doc.commits, commit)
}

// HANDLERS

func (ps *PadServer) commitPutter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	docID := r.Header.Get("doc-id")
	commit, _ := ioutil.ReadAll(r.Body)
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = NewDoc(docID)
		doc = ps.docs[docID]
	}
	doc.putCommit(Commit(commit))
}

func (ps *PadServer) commitGetter(w http.ResponseWriter, r *http.Request) {
	docID := r.Header.Get("doc-id")
	ps.mu.Lock()
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = NewDoc(docID)
		doc = ps.docs[docID]
	}
	ps.mu.Unlock()
	nextCommit, _ := strconv.Atoi(r.Header.Get("next-commit"))
	commit := doc.getCommit(nextCommit)
	w.Write([]byte(commit))
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
	http.HandleFunc("/commits/put", ps.commitPutter)
	http.HandleFunc("/commits/get", ps.commitGetter)
	http.HandleFunc("/docs/", ps.docHandler)
	http.Handle("/js/", http.FileServer(http.Dir("./")))
	http.ListenAndServe(":8080", nil)
}

func main() {
	ps := MakePadServer()
	ps.Start()
}
