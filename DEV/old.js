#!/usr/bin/env node
//require system modules
var exec = require('child_process').exec;
var fs = require('fs');
var format = require('util').format;

//require additional modules
var clc = require('cli-color');
var client = require('scp2');
var execSync = require('exec-sync');
var readJsonSync = require('read-json-sync');
var uploadBar = require('progress-bar');
//mongodb driver for node
var MongoClient = require('mongodb').MongoClient;
var Db = require('mongodb').Db;




//create virtual host file, move it to apache's directory, enable it and restart apache
//keep it synchronous!
function createVhost() {
    var data = fs.readFileSync('./.deploy/' + configuration.vHost.baseFile);

    console.log(clc.blueBright('reading virtual host source file'));

    var lines = data.toString().split("\n");

    for(i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('<<<domainName>>>') >= 0) {
            lines[i] = lines[i].replace('<<<domainName>>>', configuration.vHost.domainName);
        }
        if (lines[i].indexOf('<<<port>>>') >= 0) {
            lines[i] = lines[i].replace('<<<port>>>', configuration.port);
        }
    }

    lines = lines.join("\n");

    var hostFileName;
    if (configuration.vHost.apache24) hostFileName = configuration.vHost.domainName + '.conf';
    else hostFileName = configuration.vHost.domainName;

    console.log(clc.yellowBright("writing virtual host file for the app"));

    fs.writeFileSync("./.deploy/assets/" + hostFileName, lines);

    console.log(clc.greenBright('virtual host file created succesfully\n'));

    return hostFileName;
}

//find meteor application name
function findAppName() {
    var appName = execSync('pwd');

    return appName.substring(appName.lastIndexOf('/') + 1, appName.length);
}

//creates or updates memo files
function localMemoFiles() {
    var firstLine = false;
    var data = "";
    var update = false;

    console.log(clc.blueBright('reading memo file informations...'));
    //check if it's gonna writing the firs line of the file
    if (fs.existsSync(configuration.localProcessMemoFile)) {
        var lines = fs.readFileSync(configuration.localProcessMemoFile);

        lines = lines.toString().split("\n");
        if (lines.length === 0) firstLine = true;

        //check if current app is already in memo file
        for(i = 0; i < lines.length; i++) {
            if (lines[i].indexOf(configuration.foreverProcessName) >= 0) {
                console.log(clc.yellowBright("this app is already in memo file"));
                console.log(clc.greenBright("no need to update\n"));

                //check if port has changed
                var oldPort = lines[i].substring(lines[i].indexOf(':') + 1, lines[i].length);

                if (oldPort != configuration.port) {
                    console.log(clc.blueBright("the app is now running on a different port -> update memo file"));

                    lines[i] = lines[i].substring(0, lines[i].indexOf(':') + 1) + configuration.port + '\n';

                    update = true;
                }
                else return;
            }
        }

        if (update) {
            lines = lines.join("\n");

            fs.writeFile(configuration.localProcessMemoFile, lines, function(err) {
                if(err) throw err;

                console.log(clc.greenBright('local memo file line of this app has been updated\n'));

                return configuration.localProcessMemoFile;

            });
            return;
        }
    }
    else firstLine = true;


    //if this is the first line creates the header
    if (firstLine) {
        data = 'APPLICATION NAME:';
        while (data.length < 53) {
            data = data + " ";
        }
        data = data + "SERVER               PORT:\n";
        data = data + '--------------------------------------------------------------------------------------------\n';
    }

    console.log(clc.greenBright('done\n'));


    console.log(clc.blueBright('updating memo file...'));

    var processName = configuration.foreverProcessName;

    while (processName.length < 53) {
        processName = processName + " ";
    }

    var processServer = configuration.sshAddress;

    while (processServer.length < 21) {
        processServer = processServer + " ";
    }

    data = data + processName + processServer + ":" + configuration.port + '\n';

    fs.appendFile(configuration.localProcessMemoFile, data, function(err) {
        if(err) throw err;

        console.log(clc.greenBright('local memo file updated\n'));
    });
}

//dumps local meteor database
function mongoDump() {

    if (env.dump) {

        console.log(clc.blueBright("making dump of ") + clc.yellowBright(dumpFrom) + clc.blueBright(" meteor mongo db"));
        
        var command;

        if (dumpFrom === 'local') {
            command = "cd ./.deploy && mongodump -h 127.0.0.1 --port " + configFile.local.mongodb.port + " -d meteor";
        }
        else {
            command = "cd ./.deploy && mongodump -h " + configuration.mongodb.serverAddress + " --port " + configuration.mongodb.port + " -u " + configuration.mongodb.user + " -p " + configuration.mongodb.password + " -d " + configuration.mongodb.dbName;
        }

        exec(command, function(error, stdout, stderr) {

            if (error) {
                if (error.message.indexOf("connection attempt failed") >= 0) {
                    console.log(clc.redBright("\nCannot connect to local meteor database\nplease ensure that meteor is running\n(run ") + clc.yellowBright("meteor") + clc.redBright(" in a separate shell)\n"));
                    process.exit(1);
                }
                else throw error;
            }

            console.log(clc.greenBright("dump of local mongo db created\n"));

            createMongoDb();
        });

    }
    else createMongoDb();
}

//creates new mongo db and user for the app
function createMongoDb() {

    if (usedDeployPosition) console.log(clc.blueBright("\nstarting operations using parameters of ") + clc.greenBright(usedDeployPosition) + clc.blueBright(" object from configuration file\n"));

    if (env.newDb) {
        console.log(clc.yellowBright("Will now connect to mongo server and create new user for the application..."));

        var mongoUrl = 'mongodb://' + configuration.mongodb.rootUser + ':' + configuration.mongodb.rootPass + '@' + configuration.mongodb.serverAddress + ':' + configuration.mongodb.port + '/' + configuration.mongodb.rootAuthDb;

        MongoClient.connect(mongoUrl, function (err, db) {
            if (err) throw err;

            console.log(clc.greenBright("Succesfully connected to remote mongo server"));

            var newDb = db.db(configuration.mongodb.dbName);

            newDb.addUser(configuration.mongodb.user, configuration.mongodb.password, {roles: ['readWrite']}, function(err, result) {
                if (err) {
                    console.log(clc.redBright(err.message));
                    console.log("\n");

                    db.close();

                    mongoRestore();
                    return false;
                }

                console.log(clc.greenBright("mongodb user created\n"));

                db.close();

                mongoRestore();
            });
            
        });
    }
    else mongoRestore();
}

//restore mongo db
function mongoRestore() {

    if (env.restore) {

        console.log(clc.blueBright("restoring mongodb from ") + clc.yellowBright(restoreSubject) + clc.blueBright(" dump to ") + clc.yellowBright(restoreTo) + clc.blueBright(" ..."));
        
        var command;
        var source = configuration.mongodb.dbName;

        if (restoreSubject === 'local') source = 'meteor';

        if (!fs.existsSync('./.deploy')) {
            console.log(clc.redBright("ERROR: "));
            console.log(Clc.redBright("the specified subject for mongo restore (") + clc.yellowBright(source) + (") is not present in .deploy/dump folder"));
            console.log(clc.redBright("this means that you don't have a backup for the db you are trying to restore"));
            console.log(clc.redBright("try to run ") + clc.greenBright("deploy -dump " + source) + clc.redBright("to make a backup first..."));
            process.exit(1);
        }

        if (restoreTo === 'local') {
            command = "cd ./.deploy && mongorestore -h 127.0.0.1 --port " + configFile.local.mongodb.port + " -d meteor dump/" +  source + ' --drop';
        }
        else {
            command = "cd ./.deploy && mongorestore -h " + configuration.mongodb.serverAddress + " --port " + configuration.mongodb.port + " -u " + configuration.mongodb.user + " -p " + configuration.mongodb.password + " -d " + configuration.mongodb.dbName + " dump/" + source + ' --drop';
        }

        exec(command, function(error, stdout, stderr) {

            if (error) {
                if (error.message.indexOf("connection attempt failed") >= 0) {
                    console.log(clc.redBright("\nCannot connect to local meteor database\nif you are trying to restore to 'local',\nplease ensure that ") + clc.yellowBright("meteor") + clc.redBright("is running in a separate shell)\n"));
                    process.exit(1);
                }
                else throw error;
            }

            console.log(clc.greenBright("restore of mongo db from ") + clc.yellowBright(restoreSubject) + clc.greenBright(" to ") + clc.yellowBright(restoreTo) + clc.greenBright(" done succesfully\n"));

            deploy();
        });

    }
    else deploy();

}


//initialize current directory
function init() {
    if ((fs.existsSync('./.deploy')) && (!env.forceInit)) {
        console.log(clc.yellowBright("there is already a ") + clc.redBright(".deploy") +  clc.yellowBright(" subfolder in this folder"));
        console.log(clc.yellowBright("delete it or run ") + clc.redBright(" deploy -init -f\n"));

        process.exit(1);
    }

    console.log(clc.blueBright("Initializing folder..."));

    mkdirp('./.deploy', function(err) {
        if (err) throw err;

        exec("cp -a " + __dirname + "/../assets/. ./.deploy/assets/", function(error, stdout, stderr) {
            if (error) throw error;

            exec("cp " + __dirname + "/configuration.json ./.deploy/configuration.json", function(error, stdout, stderr) {
                if (error) throw error;

                mkdirp('./.deploy/dist', function(err) {
                    if (err) throw err;

                    mkdirp('./.deploy/dump', function(err) {
                        if (err) throw err;

                        console.log(clc.yellowBright("exit code 0"));
                        console.log(clc.greenBright("folder initialized\nnow fill ") +  clc.yellowBright("./deploy/configuration.json") + clc.greenBright(" with the needed parameters"));
                        console.log(clc.greenBright("and then run ") + clc.blueBright("deploy to <deployPosition>") + clc.greenBright(" command\n"));
                        process.exit(0);
                    });
                });
            });
        });
    });
}

function deploy() {

    if (env.deploy) {

        console.log(clc.magentaBright("--> Starting deploy of meteor application: ") + clc.yellowBright(configuration.appName));
        console.log(clc.magentaBright("--> the application will be served at ") + clc.yellowBright(configuration.vHost.domainName));
        console.log(clc.magentaBright("-----------------------------------------------------------------"));
        console.log(clc.magentaBright("CK Meteor deploy starting up... -->\n"));

        //create meteor package
        console.log(clc.yellowBright("creating meteor package..."));

        execSync("meteor build .deploy/dist");

        //tar needed files
        console.log(clc.greenBright("everything packed, go for the rest...\n"));

        if (env.vhost) {
            var hostFileName = createVhost();
            execSync('cd ./.deploy/ && tar -zcvf archive.tar.gz assets/' + hostFileName + ' dist/' + configuration.appName + '.tar.gz');
        }
        else execSync('cd ./.deploy/ && tar -zcvf archive.tar.gz dist/' + configuration.appName + '.tar.gz');

        //send created tar over ssh to remote server
        var ssh = new Connection();

        ssh.on('ready', function() {

            console.log(clc.greenBright('succesfully connected via ssh to remote server\n'));
            console.log(clc.blueBright('creating remote folder in home directory...'));

            ssh.exec('cd /home/' + configuration.sshUser + ' && mkdir -p ' + configuration.appName, function(err, stream) {
                if (err) throw err;

                stream.on('exit', function(code, signal) {
                    console.log(clc.yellowBright('exit code: ' + code));

                    if (code !== 0) {
                        operationError();
                        return false;
                    }
                }).on('close', function() {

                    console.log(clc.greenBright('remote temp folder for the package created\n'));
                    console.log(clc.blueBright('sending remote script to server...\n'));
                    uploadBar.create(process.stdout, 51);

                    //transfer tar.gz package to server
                    client.scp('.deploy/archive.tar.gz', {
                        host: configuration.sshAddress,
                        username: configuration.sshUser,
                        password: configuration.sshPass,
                        path: '/home/' + configuration.sshUser + '/' + configuration.appName + '/'
                    }, function(err) {
                        if (err) throw err;

                        //uploadBar.update(1.0);

                        console.log('\n\n');
                        console.log(clc.greenBright('archive transferred correctly\n'));

                        untarArchive(ssh,hostFileName);
                    });

                    client.on('transfer', function(buffer, uploaded, total) {
                        var percent = uploaded / total;

                        uploadBar.update(percent);
                    });
                });
            });

        }).connect({
            host: configuration.sshAddress,
            port: 22,
            username: configuration.sshUser,
            password: configuration.sshPass,
            //debug: console.log
        });

    }
}


//command line errors management function
//here use "configFile" since "configuration" is not defined yet
function checkCommandChain() {
    //other options specified with "-init"
    if ((env.init) && (process.argv.length > 3)) {
        console.log(clc.yellowBright("\nWARNING:"));
        console.log(clc.yellowBright("the ") + clc.redBright("-init") + clc.yellowBright(" option cannot be used with other options"));
        console.log(clcl.yellowBright("all other options provided will be ignored\n"));
        return;
    }

    //DEPLOY OPTION
    if (env.deploy) {
        //parameters mismatch
        if (env.newDb) {
            if ((deployTo !== undefined) && (dbOn !== undefined)) {
                if (deployTo !== dbOn) {
                    console.log(clc.yellowBright("\nWARNING:"));
                    console.log(clc.yellowBright("specified both ") + clc.redBright("to") + clc.yellowBright(" and ") + clc.redBright("on") + clc.yellowBright(" options with different vaules"));
                    console.log(clc.yellowBright("this is considered a mistake; option ") + clc.greenBright("to") + clc.yellowBright(" will be used, the other one will be ignored"));
                    console.log(clc.yellowBright("the deploy will be executed to ") + clc.greenBright(deployTo) + "\n");
                }
            }
        }

        //missing "to" parameter
        if (deployTo === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("missing ") + clc.yellowBright("to") + clc.redBright(" option for deploy -> terminating...\n"));
            process.exit(1);
        }

        //wrong "to" parameter
        if (configFile[deployTo] === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("the parameter ") + clc.yellowBright(deployTo) + clc.redBright(" specified with the ") + clc.yellowBright("to") + clc.redBright(" option does not exists in configuration file"));
            console.log(clc.redBright("please check your ") + clc.yellowBright(".deploy/configuration.json") + clc.redBright(" file -> terminating...\n"));
            process.exit(1);
        }
    }

    //NEWDB OPTION
    if (env.newDb) {
        //missing "on" parameter
        if ((!env.deploy) && (dbOn === undefined)) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("missing ") + clc.yellowBright("on") + clc.redBright(" option for mongo user creation -> terminating...\n"));
            process.exit(1);
        }

        //wrong "on" parameter
        if ((!env.deploy) && (configFile[dbOn] === undefined)) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("the parameter specified with the ") + clc.yellowBright("on") + clc.redBright(" option does not exists in configuration file"));
            console.log(clc.redBright("please check your ") + clc.yellowBright(".deploy/configuration.json") + clc.redBright(" file -> terminating...\n"));
            process.exit(1);
        }
    }

    //DUMP OPTION
    if (env.dump) {
        //missing position parameter
        if (dumpFrom === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("missing position parameter after ") + clc.yellowBright("dump (ex. deploy -dump local)\n"));
            process.exit(1);
        }
        //wrong parameter
        if (configFile[dumpFrom] === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("the parameter ") + clc.yellowBright(dumpFrom) + clc.redBright(" specified for the dump does not exists in configuration file"));
            console.log(clc.redBright("please check your ") + clc.yellowBright(".deploy/configuration.json") + clc.redBright(" file -> terminating...\n"));
            process.exit(1);
        }
    }

    //RESTORE OPTION
    if (env.restore) {
        //warning for mistake in parameters
        if ((env.deploy) && (restoreTo !== undefined) && (deployTo !== undefined)) {
            if (restoreTo !== deployTo) {
                console.log(clc.yellowBright("\nWARNING:"));
                console.log(clc.yellowBright("specified both ") + clc.redBright("to") + clc.yellowBright(" and ") + clc.redBright("-r") + clc.yellowBright(" second parameter with different vaules"));
                console.log(clc.yellowBright("this is considered a mistake; the mongo restore will be executed using ") + clc.greenBright("to") + clc.yellowBright(" option as target"));
                console.log(clc.yellowBright("the mongo restore will be executed to ") + clc.greenBright(deployTo) + "\n");
            }
        }

        //missing restoreSubject parameter
        if (restoreSubject === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("missing source parameter for ") + clc.yellowBright("-r") + clc.redBright(" option for mongo restore -> terminating...\n"));
            process.exit(1);
        }
        //wrong restoreSubject parameter
        if (configFile[restoreSubject] === undefined) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("the parameter ") + clc.yellowBright(restoreSubject) + clc.redBright(" specified as source for mongo restore does not exists in configuration file"));
            console.log(clc.redBright("please check your ") + clc.yellowBright(".deploy/configuration.json") + clc.redBright(" file -> terminating...\n"));
            process.exit(1);
        }

        //missing restoreTo parameter
        if((!env.deploy) && (restoreTo === undefined)) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("missing destination parameter after ") + clc.yellowBright("-r") + clc.redBright(" option for mongo restore -> terminating...\n"));
            process.exit(1);
        }
        //wrong restoreTo parameter
        if ((!env.deploy) && (configFile[restoreTo] === undefined)) {
            console.log(clc.redBright("\nERROR:"));
            console.log(clc.redBright("the parameter ") + clc.yellowBright(restoreTo) + clc.redBright(" specified as destination for mongo restore does not exists in configuration file"));
            console.log(clc.redBright("please check your ") + clc.yellowBright(".deploy/configuration.json") + clc.redBright(" file -> terminating...\n"));
            process.exit(1);
        }

    }
}



//display shell spinner
function shellSpinner() {
    var symbol = "-";

    var spinner = setInterval(function () {
        
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(symbol);

        switch (symbol) {

            case "-":
            symbol = "\\";
            break;

            case "\\":
            symbol = "|";
            break;

            case "|":
            symbol = "/";
            break;

            case "/":
            symbol = "-";
            break;

        }

    }, 90);

    return spinner;
}



//MAIN FLOW
console.log(clc.magentaBright("-----------------------------------------------------------------------"));
console.log(clc.magentaBright("| Meteor application deploy - ") + clc.blueBright("no way as a way, no limit as a limit...") + clc.magentaBright(" |"));
console.log(clc.magentaBright("-----------------------------------------------------------------------\n"));

//process command line arguments
if (process.argv.length < 3) {
    console.log(clc.redBright("ERROR:"));
    console.log(clc.redBright("Missing options - you need to specify what to do...\n"));
    process.exit(1);
}


var env = {};
var deployTo;
var dumpFrom;
var restoreSubject;
var restoreTo;
var dbOn;
var readConf = true;
var options = ['-init', 'to', '-newdb', '-vhost', '-dump', '-r', '-nows'];

process.argv.forEach(function(arg, index) {

    if (index >= 2) {

        switch (arg) {

            case '-init':
            if (process.argv[index + 1] == '-f') {
                env.forceInit = true;
            }
            env.init = true;
            readConf = false;
            break;

            case 'to':
            deployTo = process.argv[index + 1];
            env.deploy = true;
            break;

            case '-newdb':
            //if used alone
            if (process.argv[index + 1] == 'on') {
                dbOn = process.argv[index + 2];
            }
            env.newDb = true;
            break;

            case '-vhost':
            env.vhost = true;
            break;

            case '-dump':
            dumpFrom = process.argv[index + 1];
            env.dump = true;
            break;

            case '-r':
            restoreSubject = process.argv[index + 1];
            if (options.indexOf(process.argv[index + 2]) < 0) {
                restoreTo = process.argv[index + 2];
            }
            env.restore = true;
            break;

            case '-nows':
            env.disableWS = true;
            break;

        }

    }

});

//initialization
if (env.init) {
    init();
}

if (readConf) {

    var configFile = readJsonSync('./.deploy/configuration.json');
    var configuration;
    var usedDeployPosition;

    checkCommandChain();

    //setup configuration object
    if (deployTo !== undefined) {
        usedDeployPosition = deployTo;
        restoreTo = deployTo;
    }
    else {
        if (dbOn !== undefined) usedDeployPosition = dbOn;
        else {
            if (dumpFrom !== undefined) usedDeployPosition = dumpFrom;
            else {
                if (restoreTo !== undefined) usedDeployPosition = restoreTo;
            }
        }
    }

    configuration = configFile[usedDeployPosition];
    configuration.appName = findAppName();
    configuration.appName = configFile[usedDeployPosition].appName;

    
    //deploy
    if ((env.deploy) || (env.newDb) || (env.dump) || (env.restore)) {
        mongoDump();
    }
}