mkdir -p /var/www/paesidisandalmazzo
cd /var/www/paesidisandalmazzo
rm -Rf ./*
cp /home/cerealkiller/works/meteor/paesidisandalmazzo/paesidisandalmazzo.tar.gz ./paesidisandalmazzo.tar.gz
cd /var/www/paesidisandalmazzo && tar -zxvf paesidisandalmazzo.tar.gz
rm ./paesidisandalmazzo.tar.gz
mv ./bundle/* .
rm -Rf ./bundle
mkdir forever-logs
cd ./programs/server && npm install
cd ../..
mv main.js paesidisandalmazzo.js
export MONGO_URL='mongodb://paesidisandalmazzo:yEuUpWC8QEkx@144.76.103.88:27017/paesidisandalmazzo'
export ROOT_URL='http://localhost'
export PORT=13000

#disable websockets
if [ "$1" == "--nows" ] ; then
    export DISABLE_WEBSOCKETS=true
fi

#stop previous running process
oldProcess=$(forever list | grep paesidisandalmazzo)
if [ -n "$oldProcess" ] ; then
    forever stop paesidisandalmazzo
fi

forever --uid paesidisandalmazzo --minUptime 300 --spinSeleepTime 1000 -l /var/www/paesidisandalmazzo/forever-logs/paesidisandalmazzo.log -o /var/www/paesidisandalmazzo/forever-logs/stdout.log -e /var/www/paesidisandalmazzo/forever-logs/stderr.log start paesidisandalmazzo.js