#!/usr/bin/env node
//require system modules
var fs = require('fs');
var exec = require('child_process').exec;

//require additional modules
var program = require('commander');
var jsonReader = require('read-json-sync');
var chalk = require('chalk');

var pjson = require(__dirname + '/../package.json');
var configuration, gConf, server;
var spacer22 = "                      ";
var spacer15 = "               ";

process.stdin.setEncoding('utf8');



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

//stdout templates
function print(text, type, layout, param) {
    msgTypes = {
        error: chalk.bgRed.bold,
        warning: chalk.bgYellow.bold,

        date: chalk.magenta.bold,
        strongWarning: chalk.red.bold,
        completed: chalk.green.bold,
        important: chalk.cyan.bold,
        question: chalk.inverse.bold
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

    //do it
    exec('mkdir -p ./.deploy', function(error, stdout, stderr) {
        if (error) sendProcessError(stdout, stderr, revertInit());

        exec(assetsCpCmd, function(error, stdout, stderr) {
            if (error) sendProcessError(stdout, stderr, revertInit());

            exec(scriptsCpCmd, function(error, stdout, stderr) {
                if (error) sendProcessError(stdout, stderr, revertInit());

                exec("cp " + __dirname + "/../conf/* ./.deploy", function(error, stdout, stderr) {
                    if (error) sendProcessError(stdout, stderr, revertInit());

                    exec('mkdir -p ./.deploy/dist', function(error, stdout, stderr) {
                        if (error) sendProcessError(stdout, stderr, revertInit());

                        exec('mkdir -p ./.deploy/dump', function(error, stdout, stderr) {
                            if (error) sendProcessError(stdout, stderr, revertInit());

                            //if runtime type override is supplied -> overwrite local configuration file (just created from global one)
                            if (type !== undefined) {
                                if ((gConf !== undefined && gConf.deployType !== type) || (gConf === undefined && configuration.deployType !== type)) {
                                    configuration.deployType = type;
                                    fs.writeFileSync('./.deploy/configuration.json', JSON.stringify(configuration, null, 4));
                                    print("overwritten local configuration file", "completed", "date");
                                }
                            }

                            print("folder initialized", 'completed', 'date');
                            print("now fill ./deploy/servers.json with the needed parameters", "completed", 'spaced22');
                            print("and then run deploy to <destination> command\n", 'completed', 'spaced22');
                            process.exit(0);
                        });
                    });
                });
            });
        });
    });
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
console.log('\n');
print("loaded " + confPos + " configuration file\n", 'completed', 'date');



//================================================================================================
//======= MAIN FLOW ============ MAIN FLOW ============ MAIN FLOW ============ MAIN FLOW =========
//================================================================================================
program
    .version(pjson.version)
    .usage('[options] command [command-options]');
    //.option('-p --prova <prova>', 'Prova test');

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
        onlyInit();
        var servers = jsonReader('./.deploy/servers.json');

        if (servers[dest] === undefined) {
            sendError('E010', dest);
        }
        print('I will deploy to: ' + dest, 'important', 'date');
        print(spacer22 + 'Selected options:', 'important');
        print(spacer22 + "Disable websockets: " + (options.nows ? "true" : "false"), 'important');
        print(spacer22 + "Deploy type: " + configuration.deployType + "\n", 'important');
        print(spacer22 + "Do you want to proceed? [Y/n]", "question");

        process.stdin.on('readable', function() {
            var answer = process.stdin.read();
            if (answer !== null) {
                answer = answer.toString().replace(/\r?\n|\r/g, "");
                if (answer.toLowerCase() === 'n') process.exit(0);
                if (answer.toLowerCase() === 'y') {
                    console.log('I will do deploy');
                    process.exit(0);
                }
            }
        });
    });


program.parse(process.argv);

//no command
if (process.argv.length === 2) {
    print('What should I do for you???', 'strongWarning');
}