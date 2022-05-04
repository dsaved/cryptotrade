var module = require('./config');
var mysql = require('mysql');
var config = module.configs;
global.baseDir = __dirname;

var express = require('express');
const listener = require('./socket')

const cors = require('cors');
const logger = require('./library/logger');

var app = express();
var http = config.isSecure ? require('https') : require('http');
var server = config.isSecure ? http.createServer(config.cert, app) : http.createServer(app);
var io = require('socket.io')(server, { origins: "*" });

var workerFarm = require('worker-farm'),
    workers = workerFarm(require.resolve('./execute'), ['startTrading']),
    maxJob = 1,
    currentJobR = 0

var fs = require('fs')
var path = require('path')

app.use(cors());
app.disable('etag')

app.use(express.urlencoded({ extended: true }));
app.use(express.json())

var sqlConn;
const configPath = path.join(process.cwd(), 'config.json');
fs.readFile(configPath, (error, configuration) => {
    const conf = JSON.parse(configuration);
    if (error) {
        console.log(error);
        return;
    }
    // app.use(logger); // log all request
    require('./_pages')(app, conf.db_config); // set up routers

    app.use(function(req, res, next) {
        res.status(404);
        res.send({ success: false, message: '404 page not found' });
    });

    // create mysql connection to database
    sqlConn = mysql.createConnection(conf.db_config);
    sqlConn.connect(function(err) {
        if (err) return console.log(err);
        listener.start(io, conf.db_config)
        server.listen(conf.socket_port, async() => {
            console.log('Server listening on :%d', conf.socket_port);
        });
        initialize();
        setInterval(() => {
            initialize();
        }, 15000);
    });
});


function initialize() {
    startCryptoTrading();
}

function startCryptoTrading() {
    if (currentJobR < maxJob) {
        sqlConn.query(`SELECT * FROM trades WHERE status='active' ORDER BY id`, function(err, tradingConfig, fields) {
            if (err) return console.log(err);
            workers.startTrading(tradingConfig, function(err, result) {
                if (result.isDone) {
                    process.kill(result.id);
                    currentJobR--;
                }
            })
            currentJobR++;
        });
    }
}