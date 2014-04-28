package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/rpc"
	"os"
	"paxos"
	"strconv"
	"sync"
	"syscall"
	"time"
)

var _ = fmt.Printf
var _ = time.Sleep

type PadServer struct {
	mu         sync.Mutex
	l          net.Listener
	me         int
	dead       bool // for testing
	unreliable bool // for testing
	docs       map[string]*Doc
	ppd        *PadPersistenceWorker
	peers      []string
	px         *paxos.Paxos
	port       string
}

type Doc struct {
	commits   []Commit
	mu        sync.Mutex
	listeners []chan Commit
	Id        int64
	Name      string //TODO: Make a Doc metadata structure to store doc identification
}

type Commit string

const (
	Debug = 0
)

// DOC
func DPrintf(format string, a ...interface{}) (n int, err error) {
	if Debug > 0 {
		log.Printf(format, a...)
	}
	return
}

func (ps *PadServer) NewDoc(docID string) *Doc {
	doc := &Doc{}
	doc.commits = make([]Commit, 1)
	doc.listeners = make([]chan Commit, 0)
	doc.Id = nrand()
	doc.Name = docID

	// append document identification data to metadata
	fd, _ := os.OpenFile(METADATA+ps.port+JSON, os.O_RDWR|os.O_APPEND, 0644)
	defer fd.Close()
	b, _ := json.Marshal(doc)
	fd.Write(b)
	fd.Write([]byte("\n"))

	// create doc file on disk
	os.Create("./docs" + ps.port + "/" + strconv.FormatInt(doc.Id, 10) + JSON)

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
		ps.docs[docID] = ps.NewDoc(docID)
		doc = ps.docs[docID]
	}
	doc.putCommit(Commit(commit))
}

func (ps *PadServer) commitGetter(w http.ResponseWriter, r *http.Request) {
	docID := r.Header.Get("doc-id")
	ps.mu.Lock()
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = ps.NewDoc(docID)
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

func (ps *PadServer) kill() {
	DPrintf("Kill(%d): die\n", ps.me)
	ps.dead = true
	ps.l.Close()
	ps.px.Kill()
}

func nrand() int64 {
	max := big.NewInt(int64(1) << 62)
	bigx, _ := rand.Int(rand.Reader, max)
	x := bigx.Int64()
	return x
}

func (ps *PadServer) Start() {
	mux := http.NewServeMux()
	mux.HandleFunc("/commits/put", ps.commitPutter)
	mux.HandleFunc("/commits/get", ps.commitGetter)
	mux.HandleFunc("/docs/", ps.docHandler)
	mux.Handle("/js/", http.FileServer(http.Dir("./")))
	http.ListenAndServe(":"+ps.port, mux)
}

// PAD SERVER

func MakePadServer(port string, servers []string, me int) *PadServer {
	ps := &PadServer{}
	ps.docs = make(map[string]*Doc)
	ps.port = port
	rpcs := rpc.NewServer()
	rpcs.Register(ps)

	ps.px = paxos.Make(servers, me, rpcs)

	ps.ppd = MakePersistenceWorker(ps)
	ps.ppd.Start()

	ps.unreliable = false
	ps.dead = false

	os.Remove(servers[me])
	l, e := net.Listen("unix", servers[me])
	if e != nil {
		log.Fatal("listen error: ", e)
	}
	ps.l = l

	// please do not change any of the following code,
	// or do anything to subvert it.

	go func() {
		for ps.dead == false {
			conn, err := ps.l.Accept()
			if err == nil && ps.dead == false {
				if ps.unreliable && (nrand2()%1000) < 100 {
					// discard the request.
					conn.Close()
				} else if ps.unreliable && (nrand2()%1000) < 200 {
					// process the request but force discard of reply.
					c1 := conn.(*net.UnixConn)
					f, _ := c1.File()
					err := syscall.Shutdown(int(f.Fd()), syscall.SHUT_WR)
					if err != nil {
						fmt.Printf("shutdown: %v\n", err)
					}
					go rpcs.ServeConn(conn)
				} else {
					go rpcs.ServeConn(conn)
				}
			} else if err == nil {
				conn.Close()
			}
			if err != nil && ps.dead == false {
				fmt.Printf("Pad(%v) accept: %v\n", me, err.Error())
				ps.kill()
			}
		}
	}()
	return ps
}

/*func main() {
	srvs := make([]string, 0)
	ps := MakePadServer("8080", srvs, 0)
	ps.Start()
}*/
