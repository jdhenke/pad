#!/bin/sh

# script which runs a pad server on an EC2 instance works by copying all files,
# sshing into the instance and running the appropriate processes. note -
# cancelling this local script will leave the remote processes running. this
# will make subsequent attempts to run-remote fail until the remote processes
# are explicitly killed using `./driver $configFile kill`.

ip=$1
port=$2
user=$3
config=$4
index=$5
identity=$6
nodePort=`expr $port - 1000`
ssh -i $identity $user@$ip mkdir -p pad
scp -r -i $identity configs/ driver git-server.js index.html js/ package.json server/ $user@$ip:~/pad/
ssh -i $identity $user@$ip "cd pad; npm install; node git-server.js $nodePort & go run server/server.go $config $index"
