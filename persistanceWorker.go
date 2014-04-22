package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"strconv"
	"time"
)

const (
	DOC          = "./docs/"
	JSON         = ".json"
	METADATA     = "metadata.json"
	WAITINTERVAL = 5 * time.Second
)

/*
 * PadPersistenceWorker syncs Doc structs from the PadServer onto disk.
 */
type PadPersistenceWorker struct {
	ps *PadServer
	// TODO: need access to the node server that handles doc creation
}

/*
 * Representation of a Doc's data stored on disk. It includes the interpretted content
 * of all the diffs encountered for the doc, and the diffs themselves
 */
type PersistentDocData struct {
	Content string
	Diffs   []Diff
}

/*
 * Creates a PadPersistenceWorker for use by a PadServer. The worker will run in the
 * background and periodically interpret the current state of the server's docs, and
 * write the contents of each doc for disk recovery and later use.
 */
func MakePersistenceWorker(server *PadServer) *PadPersistenceWorker {
	ppd := PadPersistenceWorker{}
	ppd.ps = server

	if ok, _ := exists("./docs/"); !ok {
		os.Mkdir("docs", os.ModePerm) // set to permissions 0777, this should change
	}

	ppd.loadAllDocs()

	return &ppd
}

/*
 * Loads an individual Doc's PersistentDocData stored on disk
 */
func (ppd *PadPersistenceWorker) loadDoc(doc *Doc) *PersistentDocData {
	path := ppd.pathForDoc(doc)
	// read whole the file
	b, err := ioutil.ReadFile(path)
	if err != nil {
		panic(err)
	}
	data := &PersistentDocData{}
	json.Unmarshal(b, data)
	return data
}

/*
 * For initialization of server from data on disk. Reads Doc identification data
 * stored as metadata and loads it into the server's state. If no metadata exists
 * this function sets up the environment to start using persistent state.
 */
func (ppd *PadPersistenceWorker) loadAllDocs() {
	if ok, _ := exists(METADATA); ok {
		metaDataFile, _ := os.Open(METADATA)
		defer metaDataFile.Close()
		r := bufio.NewReader(metaDataFile)
		for line, _, err := r.ReadLine(); err != io.EOF; line, _, err = r.ReadLine() {
			doc := &Doc{}
			json.Unmarshal(line, doc)
			ppd.ps.docs[doc.Name] = doc
			docData := ppd.loadDoc(doc)
			doc.diffs = docData.Diffs
		}
		fmt.Println("Docs read from metaData: ", ppd.ps.docs)
	} else {
		fd, _ := os.Create(METADATA)
		fd.Close()
	}
}

/*
 * Syncs an individual document to disk. This is done by contacting the Node service
 * with the Diffs stored by each doc to receive the interpreted contents of the Doc's
 * current state. The content is written to the document's corresponding file on disk.
 */
func (ppd *PadPersistenceWorker) syncDoc(docName string, doc *Doc) error {
	oldData := ppd.loadDoc(doc)

	// For demonstration purposes:
	currentContent := oldData.Content
	if currentContent == "" {
		currentContent = "0"
	}
	// fmt.Printf("CURRENT CONTENT: %s \n", currentContent)
	temp, _ := strconv.Atoi(currentContent)
	newContent := strconv.Itoa(temp + 1) // new doc content
	// fmt.Printf("NEW CONTENT: %s \n", newContent)

	newData := PersistentDocData{newContent, doc.diffs}
	b, _ := json.Marshal(newData)

	// TODO: get doc changes to write to disk

	// write whole the body
	err := ioutil.WriteFile(ppd.pathForDoc(doc), b, 0644)
	if err != nil {
		panic(err)
	}

	return nil
}

/*
 * Ranges over the server's Docs and syncs their content to disk.
 */
func (ppd *PadPersistenceWorker) syncAllDocs() {
	for docName, doc := range ppd.ps.docs {
		// TODO: need to manage the diffs performed so far?
		go ppd.syncDoc(docName, doc)
	}
}

/*
 * Yields path to a Doc's PadPersistentData
 */
func (ppd *PadPersistenceWorker) pathForDoc(doc *Doc) string {
	return DOC + strconv.FormatInt(doc.Id, 10) + JSON
}

/*
 * Utility function. Returns true if a given path exists and false otherwise.
 */
func exists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

/*
 * Starts this instance of the PadPersistenceWorker
 */
func (ppd *PadPersistenceWorker) Start() {
	go func() {
		for {
			ppd.syncAllDocs()
			time.Sleep(WAITINTERVAL)
		}
	}()
}
