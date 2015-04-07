#if folder already exists, backup it before going on
if [ -d "<<<site-folder>>>" ]; then
	sudo mv <<<site-folder>>> <<<site-folder>>>.bak
fi

sudo mkdir -p <<<site-folder>>>
cd <<<site-folder>>>
sudo cp <<<home-folder>>>/deployTmp/tmp/<<<app-name>>>.tar.gz ./<<<app-name>>>.tar.gz
cd <<<site-folder>>> && sudo tar -zxvf <<<app-name>>>.tar.gz
sudo rm ./<<<app-name>>>.tar.gz
sudo mv ./bundle/* .
sudo rm -Rf ./bundle
cd ./programs/server && sudo npm install
cd ../..
sudo mv main.js <<<forever-process-name>>>.js
export MONGO_URL='mongodb://<<<mongodb-user>>>:<<<mongodb-pass>>>@<<<mongodb-address>>>:<<<mongodb-port>>>/<<<mongodb-dbname>>>'
export ROOT_URL='http://<<<domain>>>'
export PORT=<<<port>>>

#disable websockets
if [ "$1" = "--nows" ] ; then
    export DISABLE_WEBSOCKETS=true
fi

#stop previous running process
oldProcess=$(forever list | grep <<<forever-process-name>>>)
if [ -n "$oldProcess" ] ; then
    forever stop <<<forever-process-name>>>
fi

forever --uid <<<forever-process-name>>> --minUptime 100 --spinSeleepTime 1000 -a start <<<forever-process-name>>>.js

#remove tmp backup of previous version if exists
if [ -d "<<<site-folder>>>.bak" ]; then
	sudo rm -Rf <<<site-folder>>>.bak
fi