#!/usr/bin/env node
//require system modules
var fs = require('fs');
var exec = require('child_process').exec;

//require additional modules
var program = require('commander');
var jsonReader = require('read-json-sync');
var chalk = require('chalk');

var pjson = require(__dirname + '/../package.json');
var configuration, gConf;
var spacer22 = "                      ";
var spacer15 = "               ";

var DEBUG = false;

process.stdin.setEncoding('utf8');



//display debug logs
function debugLog(message) {
    if (DEBUG) console.log(spacer22 + "DEBUG: " + message);
}

//working spinner
function spinner() {
    var spin = ["-", "\\", "|", "/"];
    var i = 0;

    var indicator = setInterval(function() {
        process.stdout.write("\r" + spacer22 + spin[i]);
        i ++;
        if (i === 4) i = 0;
    }, 70);

    return indicator;
}

//DateTime
function getDateTime() {
    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return "[" + year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec + "]";
}

//check if initialized
function isInit() {
    if ((fs.existsSync('./.deploy')) && (fs.existsSync('./.deploy/configuration.json'))) return true;
    return false;
}

//exit with error if not initialized
function onlyInit() {
    if (!isInit()) {
        sendError("E000");
    }
}

//clean stdout from useless lines
function cleanStdout(stdout, type) {
    var result = [];

    switch (type) {
        case "meteorDeploy":
        var tmp = stdout.split("\n");
        result[0] = "[...]";
        for (i = 0; i < tmp.length; i++) {
            if ((tmp[i].indexOf("Forever") >= 0) || (tmp[i].indexOf("--spinSleepTime") >= 0)) result.push(tmp[i]);
            if (tmp[i].indexOf("stopped process") >= 0) {
                result.push(tmp[i +1]);
                result.push(tmp[i + 2]);
            }
        }
        return result.join("\n");

        default:
        return stdout;
    }
}

//stdout templates
function print(text, type, layout, param) {
    msgTypes = {
        error: chalk.bgRed.bold,
        warning: chalk.bgYellow.bold,

        date: chalk.magenta.bold,
        msgWarning: chalk.yellow.bold,
        strongWarning: chalk.red.bold,
        completed: chalk.green.bold,
        important: chalk.cyan.bold,
        question: chalk.inverse.bold,
        stdout: chalk.bgBlack.bold
    };

    if (param === undefined) param = "";

    switch (layout) {
        case "date":
        var now = new Date();
        console.log(msgTypes.date(getDateTime()) + " " + msgTypes[type](text), param);
        break;

        case "spaced22":
        console.log(msgTypes[type](spacer22 + text), param);
        break;

        default:
        console.log(msgTypes[type](text), param);
    }
}

//make all the lines of a text as long as terminal's width
function fullWidth(text, param) {
    var cols = process.stdout.columns;
    var lines = text.split('\n');
    
    for (i = 0; i < lines.length; i++) {
        var size = cols;
        if (i === 0) size = size - 15;
        if ((lines[i].indexOf('%') > 0) && (param !== undefined)) size = size - param.length + 2;
        while (lines[i].length < size) {
            lines[i] = lines[i] + " ";
        }
    }
    text = lines.join('\n');

    return text;
}

//ERRORS AND WARNINGS
//send errors
var Errors = {
    "E000": {
        description: "The current folder has not been initialized for the use with skeleploy",
        text: "You are not in a skeleploy initialized folder\n" + spacer15 + "Please run 'deploy init' first"
    },
    "E010": {
        description: "The destination provided with 'to' command, does not exists in './.deploy/servers.json' file",
        text: "specified destination is not configured: %s"
    },
    "E020": {
        description: "You have tried to initialize with a 'type' override that is not supported",
        text: "unrecognized deploy type"
    }
};
function sendError(code, param) {
    var text = fullWidth(Errors[code].text, param);

    print("[ERROR - " + code + "] " + text + "\n", 'error', 'default', param);
    process.exit(1);
}
function sendProcessError(stdout, stderr, callback) {
    var text = spacer15 + 'ERROR while executing operations:\n' + spacer15 + "--- STDOUT: ---\n" + spacer15 + stdout + "\n";
    text = text + spacer15 + "--- STDERR ---\n" + spacer15 + stderr + "\n";

    print(text + "\n", 'error', 'default');
    if (callback) callback();
    process.exit(1);
}
//send warnings
var Warnings = {
    "W001": {
        description: "You are trying to re-initialize alredy initialized folder, is this really what you want?",
        text: "there is already a .deploy subfolder in this folder\n" + spacer15 + "if you want to re-init, run 'deploy init -f'; this will overwrite .deploy folder"
    }
};
function sendWarning(code, param) {
    var text = fullWidth(Warnings[code].text, param);

    print("[!WARN - " + code + "] " + text + "\n", 'warning', 'default', param);
    process.exit(1);
}


//initialize current directory
function init(type) {
    var files = jsonReader(__dirname + '/files.json');

    if (type !== undefined) files = files[type];
    else {
        //if no runtime override provided, take files from global configuration
        if (gConf !== undefined) files = files[gConf.deployType];  //gConf -> global config file in case of local file already there
        else files = files[configuration.deployType];  //configuration -> global config file in case of first initialization
    }

    if (files === undefined) {
        sendError('E020');
    }

    print("Initializing folder...", 'important', 'date');

    //build assets copy command
    var assetsCpCmd = "mkdir ./.deploy/assets && cp";
    for (i = 0; i < files.assets.length; i++) {
        assetsCpCmd = assetsCpCmd + " " + __dirname + "/../assets/" + files.assets[i];
    }
    assetsCpCmd = assetsCpCmd + " ./.deploy/assets";

    //build scripts copy command
    var scriptsCpCmd = "mkdir ./.deploy/scripts && cp";
    for (i = 0; i < files.scripts.length; i++) {
        scriptsCpCmd = scriptsCpCmd + " " + __dirname + "/../scripts/" + files.scripts[i];
    }
    scriptsCpCmd = scriptsCpCmd + " ./.deploy/scripts";

    //Save the local configuration file
    function writeConfigFile() {
        fs.writeFileSync('./.deploy/configuration.json', JSON.stringify(configuration, null, 4));
        print("local configuration file written", "completed", "date");

        print("folder initialized", 'completed', 'date');
        print("now fill ./deploy/servers.json with the needed parameters", "completed", 'spaced22');
        print("and then run deploy to <destination> command\n", 'completed', 'spaced22');
        process.exit(0);
    }

    //specific type setup for local configuration file
    function specificSetup(type) {
        switch (type) {
            case 'meteor':
            //set default server architecture
            configuration.serverArchitecture = "undefined"; //will use current machine's architecture
            configuration.disableWebsockets = "false";
            break; 
        }
    }

    //do it
    exec('mkdir -p ./.deploy', function(error, stdout, stderr) {
        if (error) sendProcessError(stdout, stderr, revertInit());

        exec(assetsCpCmd, function(error, stdout, stderr) {
            if (error) sendProcessError(stdout, stderr, revertInit());

            exec(scriptsCpCmd, function(error, stdout, stderr) {
                if (error) sendProcessError(stdout, stderr, revertInit());

                exec("cp " + __dirname + "/../conf/* ./.deploy", function(error, stdout, stderr) {
                    if (error) sendProcessError(stdout, stderr, revertInit());

                    exec('mkdir -p ./.deploy/dump', function(error, stdout, stderr) {
                        if (error) sendProcessError(stdout, stderr, revertInit());

                        //if runtime type override is supplied -> overwrite local configuration file (just created from global one)
                        if (type !== undefined) {
                            if ((gConf !== undefined && gConf.deployType !== type) || (gConf === undefined && configuration.deployType !== type)) {
                                configuration.deployType = type;
                            }
                        }
                        specificSetup(type);
                        //get current app's name
                        exec("printf '%s' \"${PWD##*/}\"", function(error, stdout, stderr) {
                            if (error) sendProcessError(stdout, stderr, revertInit());

                            configuration.appName = stdout;
                            writeConfigFile();
                        });
                    });
                });
            });
        });
    });
}


//replace keywords in files
//cycle files
function replaceInFiles(serverConf, callback) {
    //keywords to replace
    var keywords = [
        {
            before: "<<<domain>>>",
            after: serverConf.domain
        },
        {
            before: "<<<port>>>",
            after: serverConf.port
        },
        {
            before: "<<<site-folder>>>",
            after: serverConf.webDir
        },
        {
            before: "<<<home-folder>>>",
            after: serverConf.sshUserHome
        },
        {
            before: "<<<app-name>>>",
            after: configuration.appName
        },
        {
            before: "<<<forever-process-name>>>",
            after: serverConf.foreverProcessName
        },
        {
            before: "<<<mongodb-user>>>",
            after: serverConf.mongodb.user
        },
        {
            before: "<<<mongodb-pass>>>",
            after: serverConf.mongodb.pass
        },
        {
            before: "<<<mongodb-address>>>",
            after: serverConf.mongodb.address
        },
        {
            before: "<<<mongodb-port>>>",
            after: serverConf.mongodb.port
        },
        {
            before: "<<<mongodb-dbname>>>",
            after: serverConf.mongodb.dbName
        }
    ];
    var assets = fs.readdirSync('./.deploy/assets/');
    var scripts = fs.readdirSync('./.deploy/scripts/');
    var files = [];

    for (var i = 0; i < assets.length; i++) {
        files.push("./.deploy/assets/" + assets[i]);
    }
    for (var j = 0; j < scripts.length; j++) {
        files.push("./.deploy/scripts/" + scripts[j]);
    }

    print("generating necessary files...", "important", "spaced22");
    debugLog("files for deploy: " + files);
    debugLog("total number of files: " + files.length);
    if (fs.existsSync('./.deploy/tmp')) {
        exec("rm -Rf ./.deploy/tmp", function(error, stdout, stderr) {
            cycleFiles(keywords);
        });
    }
    else cycleFiles(keywords);
    

    function cycleFiles(keywords) {
        exec("mkdir ./.deploy/tmp && mkdir ./.deploy/tmp/assets && mkdir ./.deploy/tmp/scripts", function(error, stdout, stderr) {
            if (error) sendProcessError(stdout, stderr);
            //go for replacing in all files
            for (var k = 0; k < files.length; k++) {
                debugLog("processing file: " + files[k]);
                keywordReplace(files[k], keywords, "./.deploy/tmp/");
            }
            print("All files ready", "completed", "date");

            if (callback) callback();
        });
    }
}

//replace in every file
function escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
function replaceAll(string, find, replace) {
    return string.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}
function keywordReplace(file, keywords, destDir) {
    var data = fs.readFileSync(file);
    var lines = data.toString().split("\n");

    for (var i = 0; i < lines.length; i++) {
        for (var j = 0; j < keywords.length; j++) {
            if (lines[i].indexOf(keywords[j].before) >= 0) {
                lines[i] = replaceAll(lines[i], keywords[j].before, keywords[j].after);
            }
        }
    }

    lines = lines.join("\n");
    file = file.replace("./.deploy/", destDir);
    debugLog("will write file to: " + file);
    fs.writeFileSync(file, lines);
}

//delete files from failed initialization
function revertInit(reinit, type) {
    exec("rm -Rf ./.deploy", function(error, stdout, stderr) {
        if (error) sendProcessError(stdout, stderr);
        if (reinit) init(type);
    });
}

//load configuration file; fallback to global if is not an initialized folder
function loadConfiguration() {
    var confPosition = "";

    if (isInit()) {
        confPosition = "local";
        configuration = jsonReader('./.deploy/configuration.json');
        gConf = jsonReader(__dirname + '/../conf/configuration.json');
    }
    else {
        confPosition = "global";
        configuration = jsonReader(__dirname + '/../conf/configuration.json');
    }
    return confPosition;
}

//start output on secon line for better readability
var confPos = loadConfiguration();
console.log("");
print("loaded " + confPos + " configuration file\n", 'completed', 'date');



//================================================================================================
//======= MAIN FLOW ============ MAIN FLOW ============ MAIN FLOW ============ MAIN FLOW =========
//================================================================================================
program
    .version(pjson.version)
    .usage('[options] command [command-options]')
    .option('-d --debug', 'debug mode');

//init
program
    .command('init')
    .description('Initialize current folder for deploy')
    .option('-f, --force', 'overwrite existing deploy files')
    .option('-t, --type <type>', 'type of app to deploy (run-time override)', configuration.deployType)
    .action(function(options) {
        if ((fs.existsSync('./.deploy')) && (!options.force)) {
            sendWarning('W001');
        }
        //if force option is used -> clean before re-init
        if ((fs.existsSync('./.deploy')) && (options.force)) revertInit(true, options.type);
        else init(options.type);
    });

//deploy
program
    .command('to <dest>')
    .description('deploy app to specified destination')
    .option('-w, --nows', 'disable websockets')
    .action(function(dest, options) {
        var working;
        onlyInit();
        var servers = jsonReader('./.deploy/servers.json');

        if (servers[dest] === undefined) {
            sendError('E010', dest);
        }
        print('I will deploy to: ' + dest, 'important', 'date');
        print(spacer22 + 'Selected options:', 'important');
        print(spacer22 + "Disable websockets: " + ((options.nows || configuration.disableWebsockets) ? "true" : "false"), 'important');
        print(spacer22 + "Deploy type: " + configuration.deployType + "\n", 'important');
        process.stdout.write(chalk.inverse.bold(spacer22 + "Do you want to proceed? [Y/n]") + " ");

        process.stdin.on('readable', function() {
            var answer = process.stdin.read();
            if (answer !== null) {
                answer = answer.toString().replace(/\r?\n|\r/g, "");
                if (answer.toLowerCase() !== 'y') process.exit(0);
                else {
                    process.stdout.write("\n");
                    //cache current destination config
                    var serverConf = servers[dest];
                    var sshConnection = "ssh " + serverConf.sshUser + "@" + serverConf.sshAddress;

                    print("Let's start deploy!", "completed", "date");
                    replaceInFiles(serverConf, function() {
                        //creates meteor bundle
                        var buildCommand = "meteor build ./.deploy/tmp";
                        working = spinner();
                        if ((configuration.serverArchitecture !== undefined) && (configuration.serverArchitecture !== "undefined")) buildCommand = buildCommand + " --architecture " + configuration.serverArchitecture;
                        
                        print("creating meteor package...", "important", "spaced22");
                        exec(buildCommand, function(error, stdout, stderr) {
                            if (error) sendProcessError(stdout, stderr);

                            clearInterval(working);
                            process.stdout.write("\r" + spacer22 + "- 100%\n");
                            print("meteor package created", "completed", "date");
                            //copy files to server
                            exec(sshConnection + " mkdir -p " + serverConf.sshUserHome + "/deployTmp", function(error, stdout, stderr) {
                                if (error) sendProcessError(stdout, stderr);

                                print("sending app to " + dest + " server...\n" + spacer22 + "(this will take a while)", "important", "spaced22");
                                working = spinner();
                                exec("scp -r ./.deploy/tmp " + serverConf.sshUser + "@" + serverConf.sshAddress + ":" + serverConf.sshUserHome + "/deployTmp", function(error, stdout, stderr) {
                                    if (error) sendProcessError(stdout, stderr);

                                    clearInterval(working);
                                    process.stdout.write("\r" + spacer22 + "- 100%\n");
                                    print("files copied to server\n", "completed", "date");
                                    
                                    //launch remote script to install everything
                                    print("launching remote installation...", "important", "date");
                                    var depScript = "deploy-" + configuration.deployType + ".sh";
                                    var ws = "";
                                    if ((options.nows) || (configuration.disableWebsockets)) ws = " --nows";
                                    var deployCommand = sshConnection + " chmod +x " + serverConf.sshUserHome + "'/deployTmp/tmp/scripts/" + depScript + " && " + serverConf.sshUserHome + "/deployTmp/tmp/scripts/" + depScript + ws + "'";
                                    exec(deployCommand, function(error, stdout, stderr) {
                                        if (error) sendProcessError(stdout, stderr);

                                        console.log("");
                                        print("--- REMOTE EXECUTION: stdout ---", "stdout");
                                        console.log("");
                                        console.log(cleanStdout(stdout, "meteorDeploy"));
                                        console.log("");
                                        print("--- REMOTE EXECUTION: end ---", "stdout");
                                        console.log("");

                                        print("remote installation done\n", "completed", "date");
                                        print("cleaning...", "important", "spaced22");
                                        //clean remote tmp folder
                                        exec(sshConnection + " rm -Rf " + serverConf.sshUserHome + "/deployTmp", function(error, stdout, stderr) {
                                            if (error) sendProcessError(stdout, stderr);

                                            print("Deploy completed!", "completed", "date");
                                            process.exit(0);
                                        });
                                    });
                                });
                            });
                        });
                    });
                }
            }
        });
    });


program.parse(process.argv);

if (program.debug) DEBUG = true;

//no command
if (process.argv.length === 2) {
    print('Missing command - What should I do for you???\n' + spacer22 + 'Use deploy --help if you don\'t know what to do...\n', 'strongWarning', 'spaced22');
}