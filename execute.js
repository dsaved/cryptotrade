/**
 * trading model for crypto currencies
 * @param configData is a variable holding crypto to trade on
 * @param callback this is a method called when the job is finished in other to terminate the process.
 */
exports.startTrading = async function(configData, callback) {
    var mysql = require('mysql');
    var fs = require('fs');
    const CEXIO = require('./library/cexio-api-node')
    var path = require('path');
    const axios = require('axios');
    const tor_axios = require('tor-axios');
    const configFile = require('./config.js');
    const torConfig = configFile.configs.torConfig;

    var proccessID = process.pid;
    const ORDER_TYPE = {
        market: "market",
        limit: "limit"
    }
    const TYPE = {
        buy: "buy",
        sell: "sell"
    }

    const tor = tor_axios.torSetup({
        ip: torConfig.host,
        port: torConfig.port,
        controlPort: torConfig.controlPort,
        controlPassword: torConfig.password,
    })

    const rQuest = axios.create({
        httpAgent: tor.httpAgent(),
        httpsagent: tor.httpsAgent(),
    });
    await tor.torNewSession();

    var DAYS = 365;
    var sqlConn;
    var conf = null;
    const configPath = path.join(process.cwd(), 'config.json');
    fs.readFile(configPath, (error, configuration) => {
        conf = JSON.parse(configuration);
        if (error) {
            console.log(error);
            return;
        }
        DAYS = conf.if_no_trade_in_days;
        // create mysql connection to database
        sqlConn = mysql.createConnection(conf.db_config);
        sqlConn.connect(function(err) {
            if (err) return console.log(err);
            isSqlConnected = true;
            console.log("\n");
            console.log("########################### task started ########################### ");
            start();
        });
    });

    const start = async() => {
        try {
            const cexPub = new CEXIO().promiseRest
            var pairs = [];
            await cexPub.currency_limits().then(data => {
                pairs = data.pairs;
            }).catch(err => {
                console.log('\x1b[31m%s\x1b[0m', `Error get currency_limits: ${err.message}`)
            });

            // /**
            //  * Loop through all tickers listed for trading
            //  */
            await asyncForEach(configData, async(ticker, index) => {
                var currency_limits = null;
                if (pairs) {
                    currency_limits = pairs.find(el => el.symbol2 === ticker.base_currency && el.symbol1 === ticker.ticker);
                }
                if (currency_limits) {
                    // check for buy and sell rate
                    const request = {
                        method: 'post',
                        url: `https://cex.io/api/convert/${ticker.ticker}/${ticker.base_currency}`,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        data: JSON.stringify({
                            "amnt": currency_limits.minLotSize
                        })
                    };
                    await rQuest(request)
                        .then(async function(response) {
                            if ('error' in response.data) {
                                console.log('\x1b[31m%s\x1b[0m', response.data.error)
                            } else {
                                // amount to sell for btc = 
                                const minbuyAmount = response.data.amnt;
                                if (ticker.buy_amount < minbuyAmount) {
                                    const tempPrice = ticker.buy_amount;
                                    ticker.buy_amount = financial(minbuyAmount + 2);
                                    console.log('\x1b[36m%s\x1b[0m', `purchase amount (${tempPrice} ${ticker.base_currency}) is too small. Using ${ticker.buy_amount} ${ticker.base_currency} for purchase`);
                                }

                                // query database to check if ticker is currently under trade
                                // get all transactions that has not been completed
                                var qerror = false
                                const currentTradingTransactions = `SELECT * FROM transactions WHERE type='buy' AND completed=0 AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC`;
                                var existingTicker = await query(currentTradingTransactions).catch(error => {
                                    qerror = true;
                                });

                                if (!qerror && existingTicker.length > 0) {
                                    await asyncForEach(existingTicker, async($transaction, index) => {
                                        // try selling the cryto that was bought
                                        // console.log('\x1b[36m%s\x1b[0m', `found transaction for ${ticker.ticker}`);
                                        await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                            //check if trasaction is buy or sell
                                            if ($transaction.type === TYPE.buy) {
                                                // check if existing ticker has made some interest then sell it.
                                                // sell the crypto if it has made x%
                                                const amount = $transaction.symbol1Amount;
                                                console.log('')
                                                console.log(`\x1b[36m************************* \x1b[37mSELL STATS (${ticker.ticker}) \x1b[36m*************************`)
                                                console.log('\x1b[36m%s\x1b[0m', `Amount to sell ${amount} ${ticker.ticker}`);
                                                const gain = parseFloat(percentage(ticker.change_percentage_sell, $transaction.bid)) + parseFloat($transaction.bid)

                                                if (parseFloat(data.bid) >= gain) {
                                                    fs.appendFile('logs/' + getDate() + '.log', `${getDate()} ${getTime()} - time to sell crypto: ${data.bid} (${ticker.ticker})\n\n\n`, function(err) {
                                                        if (err) throw err;
                                                    });
                                                    console.log('\x1b[36m%s\x1b[0m', `bought @\x1b[33m${$transaction.bid} \x1b[36mtime to sell ${$transaction.ticker}: \x1b[32m${parseFloat(data.bid)}\x1b[32m/${gain}`);
                                                } else if (parseFloat(data.bid) > $transaction.bid && parseFloat(data.bid) < gain) {
                                                    console.log('\x1b[36m%s\x1b[0m', `bought @\x1b[33m${$transaction.bid} \x1b[36mconsider selling: \x1b[33m${parseFloat(data.bid)}\x1b[32m/${gain}`);
                                                } else {
                                                    console.log('\x1b[36m%s\x1b[0m', `bought @\x1b[33m${$transaction.bid} \x1b[36mwill not sell: \x1b[31m${parseFloat(data.bid)}\x1b[32m/${gain}`);
                                                }
                                                if (parseFloat(data.bid) >= gain) {
                                                    await sellCrypto(ticker, data, amount, $transaction);
                                                } else {
                                                    console.log('\x1b[36m%s\x1b[0m', `No sell`);
                                                }
                                                console.log('')

                                                // select current ticker pending trade
                                                var pendingTrades = await query(currentTradingTransactions).catch(error => {});

                                                /**
                                                 * if ticker has not made any interest and ticker current price is less
                                                 * than buy price? check if the number of trade for that ticker is reached
                                                 * if ticker has not reached its limit then buy more ticker
                                                 */
                                                if (pendingTrades != null && typeof(pendingTrades[0]) != "undefined" && pendingTrades.length < ticker.number_of_trades) {
                                                    //buy crypto ######################################
                                                    // only if trading is on
                                                    const shouldTradeSQL = `SELECT * FROM trades WHERE trading='yes' AND ticker='${ticker.ticker}' LIMIT 1`;
                                                    var shouldTrade = await query(shouldTradeSQL).catch(error => {});
                                                    if (shouldTrade !== null && shouldTrade.length > 0) {
                                                        const lastSellDataSQL = `SELECT * FROM transactions WHERE type='sell' AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC LIMIT 1`;
                                                        var sellData = await query(lastSellDataSQL).catch(error => {});
                                                        if ((sellData !== null && typeof(sellData[0]) != "undefined") && sellData[0].transaction_id > $transaction.transaction_id) {
                                                            const lastSellData = sellData[0];

                                                            //check if the price fell lower than the previous buy by certain percentage
                                                            // of if the last sell is last before the last buy
                                                            const transactionHigh = parseFloat(lastSellData.bid) - parseFloat(percentage(ticker.change_percentage_buy, lastSellData.bid));
                                                            console.log('')
                                                            console.log(`\x1b[36m************************* \x1b[37mEXTRA TRADE (${ticker.ticker}) \x1b[36m*************************`)
                                                            console.log('\x1b[36m%s\x1b[0m', `Amount to buy ${ticker.buy_amount} ${ticker.base_currency}`);
                                                            console.log('\x1b[36m%s\x1b[0m', `Details for ${ticker.ticker}: Current price(${ticker.base_currency}): \x1b[37m${data.last}\x1b[36m, Expected price(${ticker.base_currency}): \x1b[32m${transactionHigh} `);
                                                            console.log('\x1b[36m%s\x1b[0m', `Last sell bid: ${lastSellData.bid} Current bid: ${data.bid} `); // bid data
                                                            console.log('')
                                                            if (parseFloat(data.last) < transactionHigh) {
                                                                await buyCrypto(ticker, data);
                                                            }
                                                        } else {
                                                            //check if the price fell lower than the previous buy by certain percentage
                                                            // of if the last sell is last before the ast buy
                                                            const transactionHigh = parseFloat($transaction.last) - parseFloat(percentage(ticker.change_percentage_buy, $transaction.last));
                                                            console.log('')
                                                            console.log(`\x1b[36m************************* \x1b[37mEXTRA TRADE (${ticker.ticker}) \x1b[36m*************************`)
                                                            console.log('\x1b[36m%s\x1b[0m', `Amount to buy ${ticker.buy_amount} ${ticker.base_currency}`);
                                                            console.log('\x1b[36m%s\x1b[0m', `Details for ${ticker.ticker}: Current price(${ticker.base_currency}): \x1b[37m${data.last}\x1b[36m, Expected price(${ticker.base_currency}): \x1b[32m${transactionHigh} `);
                                                            console.log('\x1b[36m%s\x1b[0m', `Last buy Low: ${$transaction.low} Last buy High: ${$transaction.high} `); // buy data
                                                            console.log('')
                                                            if (parseFloat(data.last) < transactionHigh) {
                                                                await buyCrypto(ticker, data);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }).catch(err => {
                                            console.error(err)
                                        })
                                    });
                                } else {
                                    const shouldTradeSQL = `SELECT * FROM trades WHERE trading='yes' AND ticker='${ticker.ticker}' LIMIT 1`;
                                    var shouldTrade = await query(shouldTradeSQL).catch(error => {});
                                    if (shouldTrade !== null && shouldTrade.length > 0) {
                                        var lastSellQerror = false
                                        const SELLINGTRADDATA = `SELECT * FROM transactions WHERE type='sell' AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC LIMIT 1`;
                                        var EXISTINGSOLDTRANSACTION = await query(SELLINGTRADDATA).catch(error => { lastSellQerror = true; });

                                        if (lastSellQerror || (EXISTINGSOLDTRANSACTION == null || EXISTINGSOLDTRANSACTION.length < 1)) {
                                            // no trade found for ticker, then check if ticker falls below certain points and make a puchase
                                            await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                                //buy crypto
                                                const high = parseFloat(data.high) - parseFloat(percentage(ticker.change_percentage_buy, data.high));
                                                console.log('')
                                                console.log(`\x1b[36m************************* \x1b[37mBUY STATS (${ticker.ticker}) \x1b[36m*************************`)
                                                console.log('\x1b[36m%s\x1b[0m', `Amount to buy ${ticker.buy_amount} ${ticker.base_currency}`);
                                                console.log('\x1b[36m%s\x1b[0m', `Details for ${ticker.ticker}: Current price(${ticker.base_currency}): \x1b[37m${data.last}\x1b[36m, Expected price(${ticker.base_currency}): \x1b[32m${high} `);
                                                console.log('\x1b[36m%s\x1b[0m', `Current Low: ${data.low} Current High: ${data.high} `);
                                                console.log('')
                                                if (parseFloat(data.last) < high) {
                                                    await buyCrypto(ticker, data);
                                                }
                                            }).catch(err => {
                                                console.error(err)
                                            })
                                        } else {
                                            // use last sell transaction to make furture buying
                                            const resultTransaction = EXISTINGSOLDTRANSACTION[0];
                                            await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                                //buy crypto
                                                const high = parseFloat(resultTransaction.bid) - parseFloat(percentage(ticker.change_percentage_buy, resultTransaction.bid));
                                                console.log('')
                                                console.log(`\x1b[36m************************* \x1b[37mBUY STATS (${ticker.ticker}) \x1b[36m*************************`)
                                                console.log('\x1b[36m%s\x1b[0m', `Amount to buy ${ticker.buy_amount} ${ticker.base_currency}`);
                                                console.log('\x1b[36m%s\x1b[0m', `Details for ${ticker.ticker}: Current price(${ticker.base_currency}): \x1b[37m${data.last}\x1b[36m, Expected price(${ticker.base_currency}): \x1b[32m${high} `);
                                                console.log('\x1b[36m%s\x1b[0m', `Last sell bid: ${resultTransaction.bid} Current bid: ${data.bid} `);
                                                console.log('')
                                                if (parseFloat(data.bid) < high) {
                                                    await buyCrypto(ticker, data);
                                                } else {
                                                    var past = new Date(`${resultTransaction.datetime}`);
                                                    var totady = new Date();
                                                    totady.setDate(totady.getDate() - DAYS);
                                                    if (totady.getTime() > past.getTime()) {
                                                        const high_ = parseFloat(data.high) - parseFloat(percentage(ticker.change_percentage_buy, data.high));
                                                        console.log('')
                                                        console.log(`\x1b[36m************************* \x1b[37m${DAYS} DAY(S) PASS NO TRADE. TRADING NOW (${ticker.ticker}) \x1b[36m*************************`)
                                                        console.log('\x1b[36m%s\x1b[0m', `Amount to buy ${ticker.buy_amount} ${ticker.base_currency}`);
                                                        console.log('\x1b[36m%s\x1b[0m', `Details for ${ticker.ticker}: Current price(${ticker.base_currency}): \x1b[37m${data.last}\x1b[36m, Expected price(${ticker.base_currency}): \x1b[32m${high_} `);
                                                        console.log('\x1b[36m%s\x1b[0m', `Current Low: ${data.low} Current High: ${data.high} `);
                                                        console.log('')
                                                        if (parseFloat(data.last) < high_) {
                                                            await buyCrypto(ticker, data);
                                                        }
                                                    }
                                                }
                                            }).catch(err => {
                                                console.error(err)
                                            })
                                        }
                                    }
                                }
                            }
                        })
                        .catch(function(error) {
                            console.log('\x1b[31m%s\x1b[0m', error)
                        });
                }
            });

        } catch (error) {
            console.error(error);
        } finally {
            console.log("################### task completed successfully #################### ");
            console.log("\n");
            callback(null, {
                isDone: true,
                id: proccessID
            });
        }
    }

    function financial(x) {
        return Number.parseFloat(x).toFixed(2);
    }

    function percentage(percent, number) {
        const result = (parseFloat(`${percent}`) / 100) * parseFloat(`${number}`);
        return Number.parseFloat(result).toFixed(2);
    }

    /**
     * buy crypto currency
     * @param {String} ticker the crypto to buy
     * @param {Objectt} data current ticker stat
     */
    async function buyCrypto(ticker, data) {
        const auth = conf.api_authentications[ticker.auth];
        const cexAuth = new CEXIO(auth.userID, auth.apiKey, auth.apiSecret).promiseRest
        console.log('')
        console.log(`\x1b[36m************************* \x1b[37mBUY! BUY! BUY! (${ticker.ticker}) \x1b[36m*************************`)
        await cexAuth.place_order(`${ticker.ticker}/${ticker.base_currency}`, TYPE.buy, ticker.buy_amount, "0.0", ORDER_TYPE.market).then(async orderData => {
            if (`${orderData}`.includes("error")) {
                console.log('\x1b[31m%s\x1b[0m', orderData)
                fs.appendFile('logs/' + getDate() + '-transaction-error.log', `${getTime()} - Error: ${JSON.stringify(orderData)}\n\n
                Extra:\n
                   amount: ${ticker.buy_amount}\n
                   cypto amount: 0.0\n
                   order type: ${ORDER_TYPE.market}\n
                   action: buy\n
                   Ticker: ${ticker.ticker}/${ticker.base_currency}\n\n\n`, function(err) {
                    if (err) throw err;
                });
            } else {
                console.log('\x1b[32m%s\x1b[0m', orderData)
                const currency = `${orderData.message}`.split(' ');
                const fiat = currency[9];
                const crypto = currency[6];
                await insert("transactions", {
                    transid: orderData.id,
                    ticker: ticker.ticker,
                    timestamp: data.timestamp,
                    low: data.low,
                    last: data.last,
                    high: data.high,
                    volume: data.volume,
                    volume30d: data.volume30d,
                    bid: data.bid, // Bid price is the point at which a buyer is ready to buy
                    ask: data.ask, //Ask price is the value point at which the seller is ready to sell
                    price_change: data.priceChange,
                    price_change_percentage: data.priceChangePercentage,
                    pair: data.pair,
                    symbol2Amount: fiat, // fiat
                    symbol1Amount: crypto, //crypto
                    time: orderData.time,
                    message: orderData.message,
                    type: orderData.type,
                    order_type: ORDER_TYPE.market,
                });
            }
        }).catch(err => {
            console.log('\x1b[31m%s\x1b[0m', err)
            fs.appendFile('logs/' + getDate() + '-transaction-error.log', `${getTime()} - Error: ${JSON.stringify(err)}\n\n
            Extra:\n
               amount: ${ticker.buy_amount}\n
               cypto amount: 0.0\n
               order type: ${ORDER_TYPE.market}\n
               action: buy\n
               Ticker: ${ticker.ticker}/${ticker.base_currency}\n\n\n`, function(err) {
                if (err) throw err;
            });
        })
        console.log('')
    }

    /**
     * sell crypto currency
     * @param {String} ticker the crypto to sell
     * @param {Objectt} data current ticker stat
     * @param {Objectt} amount crypto amount to sell
     * @param {Objectt} transaction existing transaction data
     */
    async function sellCrypto(ticker, data, amount, transaction) {
        const auth = conf.api_authentications[ticker.auth];
        const cexAuth = new CEXIO(auth.userID, auth.apiKey, auth.apiSecret).promiseRest
        console.log('')
        console.log(`\x1b[36m************************* \x1b[37mSELL! SELL! SELL! (${ticker.ticker}) \x1b[36m*************************`)
        await cexAuth.place_order(`${ticker.ticker}/${ticker.base_currency}`, TYPE.sell, amount, '0.0', ORDER_TYPE.market).then(async orderData => {
            if (`${orderData}`.includes("error")) {
                console.log('\x1b[31m%s\x1b[0m', orderData)
                fs.appendFile('logs/' + getDate() + '-transaction-error.log', `${getTime()} - Error: ${JSON.stringify(orderData)}\n\n
                Extra:\n
                   amount: 0.0\n
                   cypto amount: ${amount}\n
                   order type: ${ORDER_TYPE.market}\n
                   action: sell\n
                   Ticker: ${ticker.ticker}/${ticker.base_currency}\n\n\n`, function(err) {
                    if (err) throw err;
                });
            } else {
                console.log('\x1b[32m%s\x1b[0m', orderData)
                fs.appendFile('logs/' + getDate() + 'sold.log', `${getTime()} - Completed: ${JSON.stringify(orderData)}\n\n\n`, function(err) {
                    if (err) throw err;
                });
                const currency = `${orderData.message}`.split(' ');
                const fiat = currency[9];
                const crypto = currency[6];
                await insert("transactions", {
                    transid: orderData.id,
                    ticker: ticker.ticker,
                    timestamp: data.timestamp,
                    low: data.low,
                    high: data.high,
                    volume: data.volume,
                    volume30d: data.volume30d,
                    bid: data.bid,
                    ask: data.ask,
                    price_change: data.priceChange,
                    price_change_percentage: data.priceChangePercentage,
                    pair: data.pair,
                    symbol2Amount: fiat, // fiat
                    symbol1Amount: crypto, //crypto
                    time: orderData.time,
                    message: orderData.message,
                    transaction_id_linked: transaction.transaction_id,
                    type: orderData.type,
                    order_type: ORDER_TYPE.market,
                });
                await update("transactions", "transaction_id", transaction.transaction_id, {
                    completed: 1
                });
            }
        }).catch(err => {
            console.log('\x1b[31m%s\x1b[0m', err)
            fs.appendFile('logs/' + getDate() + '-transaction-error.log', `${getTime()} - Error: ${JSON.stringify(err)}\n\n
            Extra:\n
               amount: 0.0\n
               cypto amount: ${amount}\n
               order type: ${ORDER_TYPE.market}\n
               action: sell\n
               Ticker: ${ticker.ticker}/${ticker.base_currency}\n\n\n`, function(err) {
                if (err) throw err;
            });
        })
    }

    async function asyncForEach(array, arrayCallback) {
        for (let index = 0; index < array.length; index++) {
            await arrayCallback(array[index], index, array);
        }
    }

    /**
     * update in to the database
     * @param {String} table The name of the table to insert into
     * @param {String} column the column in the db to mach
     * @param val value used to match the column
     * @param {Object} data the object containing key and values to insert
     */
    async function update(table, column, val, data) {
        // set up an empty array to contain the WHERE conditions
        let values = [];
        // Iterate over each key / value in the object
        Object.keys(data).forEach(function(key) {
            // if the value is an empty string, do not use
            if ('' === data[key]) {
                return;
            }
            // if we've made it this far, add the clause to the array of conditions
            values.push(`\`${key}\` = '${data[key]}'`);
        });
        // convert the where array into a string of , clauses
        values = values.join(' , ');
        // check the val type is string and set it as string 
        if (typeof(val) == "string") {
            val = `'${val}'`;
        }

        const sql = `UPDATE \`${table}\` SET ${values} WHERE \`${column}\`= ${val}`;
        await query(sql).catch(error => {
            console.log('\x1b[31m%s\x1b[0m', error)
            fs.appendFile('logs/' + getDate() + '-mysql-error.log', `${getTime()} - Error: ${JSON.stringify(error)}\n\n
            Extra:\n
               Query: ${sql}\n\n\n`, function(err) {
                if (err) throw err;
            });
            callback(null, {
                isDone: true,
                id: proccessID
            });
        });
    }

    /**
     * insert in to the database
     * @param {String} table The name of the table to insert into
     * @param {Object} data the object containing key and values to insert
     */
    async function insert(table, data) {
        if (!table) return;
        if (!data) return;
        // set up an empty array to contain the  columns and values
        let columns = [];
        let values = [];
        // Iterate over each key / value in the object
        Object.keys(data).forEach(function(key) {
            // if the value is an empty string, do not use
            if ('' === data[key]) {
                return;
            }
            // if we've made it this far, add the clause to the array of conditions
            columns.push(`\`${key}\``);
            values.push(`'${data[key]}'`);
        });
        // convert the columns array into a string of
        columns = "(" + columns.join(' , ') + ")";
        // convert the values array into a string 
        values = "VALUES (" + values.join(' , ') + ");";
        //construct the insert statement
        const sql = `INSERT INTO \`${table}\`${columns} ${values}`;
        const results = await query(sql).catch(error => {
            console.log('\x1b[31m%s\x1b[0m', error)
            fs.appendFile('logs/' + getDate() + '-mysql-error.log', `${getTime()} - Error: ${JSON.stringify(error)}\n\n
            Extra:\n
               Query: ${sql}\n\n\n`, function(err) {
                if (err) throw err;
            });
            callback(null, {
                isDone: true,
                id: proccessID
            });
        })
        return results.insertId;
    }

    function query(sqlQuery) {
        return new Promise(function(resolve, reject) {
            sqlConn.query(sqlQuery, function(err, result, fields) {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    function getTime() {
        var today = new Date();
        var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
        return time;
    }

    function getDate() {
        var today = new Date();
        var time = today.getDate() + "_" + (today.getMonth() + 1) + "_" + today.getFullYear();
        return time;
    }
}