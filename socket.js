const Pagination = require('./library/MYSqlPagination');
const mysql = require('./library/mysql');
const CEXIO = require('./library/cexio-api-node');

const axios = require('axios');
const tor_axios = require('tor-axios');
const configFile = require('./config.js');
const torConfig = configFile.configs.torConfig;

const tor = tor_axios.torSetup({
    ip: torConfig.host,
    port: torConfig.port,
    controlPort: torConfig.controlPort,
    controlPassword: torConfig.password,
})

var rQuest = axios.create({
    httpAgent: tor.httpAgent(),
    httpsagent: tor.httpsAgent(),
});

const socketConnect = {
    start: async(io, db_config) => {
        var x;
        try {
            io.on('connection', function(socket) {
                console.log('client connected')
                    //on new_connection extablished
                    //store the connection channel in an array agaist the user name
                socket.on('new_connection', data => {
                    //first message sent to confirm if client can receive message
                    socket.emit('event_response', "Welcome!");
                });

                //check online status of a connected user
                socket.on('trading', async data => {
                    sendTrade(io, db_config);
                });

                //check online status of a connected user
                socket.on('abouttotrade', async data => {
                    sendAboutToBuy(io, db_config);
                });

                // when the user disconnects.. perform this
                socket.on('disconnect', function() {
                    console.log('client disconnected')
                });
            });
            x = setInterval(async() => {
                sendTrade(io, db_config);
            }, 9000);
        } catch (err) {
            if (x) {
                clearInterval(x);
            }
            console.error("Error occured: ", err)
        }
    }
}

async function sendTrade(io, db_config) {
    const cexPub = new CEXIO().promiseRest
    let condition = "WHERE type='buy' AND completed=0 ORDER BY transaction_id DESC ";

    try {
        const db = new mysql(db_config);
        const paging = new Pagination(db_config);
        paging.table("transactions");
        paging.condition(condition)
        paging.result_per_page(100);
        paging.pageNum(1)

        await paging.run();
        const results = paging.results();
        if (paging.count() > 0) {
            var transactions = [];
            for (var i = 0; i < results.length; i++) {
                const transaction = results[i];
                const tradeTickers = `${transaction.pair}`.split(':');
                const tradeTicker = tradeTickers.join('/')
                const tickerName = tradeTickers[0];
                // select ticker from trades having this ticker name
                await db.query(`SELECT * FROM trades WHERE ticker='${tickerName}' LIMIT 1`);
                if (db.count() > 0) {
                    const trade_ = db.results()[0];
                    await cexPub.ticker(`${tradeTicker}`).then(async data => {
                        const amount = transaction.symbol1Amount;
                        const gain = parseFloat(percentage(trade_.change_percentage_sell, transaction.bid)) + parseFloat(transaction.bid)
                        const trade = {
                            ticker: trade_.ticker,
                            pair: transaction.pair,
                            trans_id: transaction.trans_id,
                            transanction_id: transaction.transaction_id,
                            amount_to_sell: `${amount} ${trade_.ticker}`,
                            buy_bid: transaction.bid,
                            current_bid: data.bid,
                            gain: gain,
                            status: trade_.status,
                            trading: trade_.trading,
                        }
                        transactions.push(trade);
                    }).catch(err => {
                        console.error(err)
                    })
                }
            }
            //should end here
            paging.reset();

            //send reply to io user
            io.emit('trade', {
                success: true,
                trade: transactions,
                pagination: paging.pagination()
            });
        } else {
            io.emit('trade', {
                success: false,
                message: 'No transactions found',
                trade: [],
                pagination: paging.pagination()
            });
        }
    } catch (error) {
        io.emit('trade', {
            success: false,
            message: 'No transactions found',
            trade: []
        });
    }
}

async function sendAboutToBuy(io, db_config) {
    const db = new mysql(db_config);
    const cexPub = new CEXIO().promiseRest

    const TYPE = {
        buy: "buy",
        sell: "sell"
    }

    var pairs = [];
    await cexPub.currency_limits().then(data => {
        pairs = data.pairs;
    }).catch(err => {});

    var tcDB = db;
    await tcDB.query(`SELECT * FROM trades WHERE status='active' ORDER BY id`);
    tickers = tcDB.results();

    var transactions = [];
    // /**
    //  * Loop through all tickers listed for trading
    //  */
    await asyncForEach(tickers, async(ticker, index) => {
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
                    const shouldTradeSQL = `SELECT * FROM trades WHERE trading='yes' AND ticker='${ticker.ticker}' LIMIT 1`;
                    if ('error' in response.data) {
                        console.log(response.data)
                    } else {
                        // amount to sell for crypto 
                        const minbuyAmount = response.data.amnt;
                        if (ticker.buy_amount < minbuyAmount) {
                            ticker.buy_amount = financial(minbuyAmount + 2);
                        }
                        try {
                            const currentTradingTransactions = `SELECT * FROM transactions WHERE type='buy' AND completed=0 AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC`;
                            const cccDB = db;
                            await cccDB.query(currentTradingTransactions);
                            if (cccDB.count() > 0) {
                                const existingTicker = cccDB.results();
                                await asyncForEach(existingTicker, async($transaction, index) => {
                                    await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                        //check if trasaction is buy or sell
                                        if ($transaction.type === TYPE.buy) {
                                            const pdDB = db;
                                            await pdDB.query(currentTradingTransactions);
                                            /**
                                             * if ticker has not made any interest and ticker current price is less
                                             * than buy price? check if the number of trade for that ticker is reached
                                             * if ticker has not reached its limit then buy more ticker
                                             */
                                            if (pdDB.count() < ticker.number_of_trades && !containsObject(ticker, transactions)) {
                                                //buy crypto ######################################
                                                // only if trading is on
                                                const shdDB = db;
                                                await shdDB.query(shouldTradeSQL);
                                                if (shdDB.count() > 0) {
                                                    const lastSellDataSQL = `SELECT * FROM transactions WHERE type='sell' AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC LIMIT 1`;
                                                    await db.query(lastSellDataSQL);
                                                    var sellData = db.results();
                                                    if (db.count() > 0 && sellData[0].transaction_id > $transaction.transaction_id) {
                                                        const lastSellData = sellData[0];
                                                        //check if the price fell lower than the previous buy by certain percentage
                                                        // of if the last sell is last before the last buy
                                                        const transactionHigh = parseFloat(lastSellData.bid) - parseFloat(percentage(ticker.change_percentage_buy, lastSellData.bid));
                                                        const trade = {
                                                            title: `EXTRA BUY STATS (${ticker.ticker})`,
                                                            ticker: `${ticker.ticker}`,
                                                            base_currency: `${ticker.base_currency}`,
                                                            current_price: `${data.last}`,
                                                            expected_price: `${transactionHigh}`,
                                                            amount_to_buy: `${ticker.buy_amount} ${ticker.base_currency}`,
                                                            d1: `Last sell bid: ${lastSellData.bid}`,
                                                            d2: `Current bid: ${data.bid}`,
                                                        }
                                                        transactions.push(trade);
                                                    } else {
                                                        //check if the price fell lower than the previous buy by certain percentage
                                                        // of if the last sell is last before the ast buy
                                                        const transactionHigh = parseFloat($transaction.last) - parseFloat(percentage(ticker.change_percentage_buy, $transaction.last));
                                                        const trade = {
                                                            title: `EXTRA BUY STATS (${ticker.ticker})`,
                                                            ticker: `${ticker.ticker}`,
                                                            base_currency: `${ticker.base_currency}`,
                                                            current_price: `${data.last}`,
                                                            expected_price: `${transactionHigh}`,
                                                            amount_to_buy: `${ticker.buy_amount} ${ticker.base_currency}`,
                                                            d1: `Last buy Low: ${$transaction.low}`,
                                                            d2: `Last buy High: ${$transaction.high}`,
                                                        }
                                                        transactions.push(trade);
                                                    }
                                                }
                                            }
                                        }
                                    }).catch(err => {
                                        console.error(err)
                                    })
                                });
                            } else {
                                await db.query(shouldTradeSQL);
                                if (db.count() > 0) {
                                    const SELLINGTRADDATA = `SELECT * FROM transactions WHERE type='sell' AND ticker='${ticker.ticker}' ORDER BY transaction_id DESC LIMIT 1`;
                                    await db.query(SELLINGTRADDATA);
                                    const EXISTINGSOLDTRANSACTION = db.results();
                                    if (db.count() < 1) {
                                        // no trade found for ticker, then check if ticker falls below certain points and make a puchase
                                        await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                            //buy crypto
                                            const high = parseFloat(data.high) - parseFloat(percentage(ticker.change_percentage_buy, data.high));
                                            const trade = {
                                                title: `BUY STATS (${ticker.ticker})`,
                                                ticker: `${ticker.ticker}`,
                                                base_currency: `${ticker.base_currency}`,
                                                current_price: `${data.last}`,
                                                expected_price: `${high}`,
                                                amount_to_buy: `${ticker.buy_amount} ${ticker.base_currency}`,
                                                d1: `Low: ${data.low}`,
                                                d2: `High: ${data.high} `,
                                            }
                                            transactions.push(trade);
                                        }).catch(err => {
                                            console.error(err)
                                        })
                                    } else {
                                        // use last sell transaction to make furture buying
                                        const resultTransaction = EXISTINGSOLDTRANSACTION[0];
                                        await cexPub.ticker(`${ticker.ticker}/${ticker.base_currency}`).then(async data => {
                                            //buy crypto
                                            const high = parseFloat(resultTransaction.bid) - parseFloat(percentage(ticker.change_percentage_buy, resultTransaction.bid));
                                            const trade = {
                                                title: `BUY STATS (${ticker.ticker})`,
                                                ticker: `${ticker.ticker}`,
                                                base_currency: `${ticker.base_currency}`,
                                                current_price: `${data.last}`,
                                                expected_price: `${high}`,
                                                amount_to_buy: `${ticker.buy_amount} ${ticker.base_currency}`,
                                                d1: `Last sell bid: ${resultTransaction.bid}`,
                                                d2: `Current bid: ${data.bid} `,
                                            }
                                            transactions.push(trade);
                                        }).catch(err => {
                                            console.error(err)
                                        })
                                    }
                                }
                            }
                        } catch (error) {}
                    }
                })
                .catch(function(error) {});
        }
    });

    console.log(transactions);
    //send reply to io user
    io.emit('totrade', {
        success: true,
        trade: transactions
    });
}

function containsObject(obj, list) {
    var i;
    for (i = 0; i < list.length; i++) {
        if (`${list[i].ticker}`.trim() === `${ obj.ticker}`.trim()) {
            return true;
        }
    }
    return false;
}

async function asyncForEach(array, arrayCallback) {
    for (let index = 0; index < array.length; index++) {
        await arrayCallback(array[index], index, array);
    }
}

function financial(x) {
    return Number.parseFloat(x).toFixed(2);
}

function percentage(percent, number) {
    const result = (parseFloat(`${percent}`) / 100) * parseFloat(`${number}`);
    return Number.parseFloat(result).toFixed(2);
}

// async..await is not allowed in global scope, must use a wrapper
async function mail(to, message, subject) {
    const emailDatas = {
        date: new Date(),
        header: subject, //message subject
        message: message,
        app_name: "GAS",
        sitelink: "https://assets.auditshub.com",
        disclaimer: `<p>This is a confidential email and may also be privileged. If you are not the intended recipient, please inform us immediately. You are not allowed to copy or use it for any purpose nor disclose its contents to any other person Please note that there is a risk that information requested via email can be tampered with, by hackers while en route to your mailbox or seen by unauthenticated individuals if your mailbox security is inadequate E-Statements are your contribution towards a safer, cleaner environment. We thank you for contributing to the protection of our environment, do not print this mail.</p><p>DISCLAIMER: This email and any attachments are confidential and are intended solely for the addressee. If you are not the addressee tell the sender immediately and destroy it. Do not open, read, copy, disclose, use or store it in any way, or permit others to do so. Emails are not secure and may suffer errors, viruses, delay, interception, and amendment. GAS and its subsidiaries do not accept liability for damage caused by this email and may monitor email traffic.</p>`,
    };
    config.file_system.readFile('email-tpl/default.html', async function(err, html) {
        if (err) {
            console.log(err);
        } else {
            let template = String(html)
            for (const key in emailDatas) {
                const value = emailDatas[key];
                var re = new RegExp('{{' + key + '}}', 'g');
                template = template.replace(re, value);
            }

            // create reusable transporter object using the default SMTP transport
            let transporter = nodemailer.createTransport(config.email);
            // send mail with defined transport object
            let info = await transporter.sendMail({
                from: config.email.sender, // sender address
                to: to, // list of receivers
                subject: subject, // Subject line
                text: message, // plain text body
                html: `${template}`, // html body
            });
            console.log("Message sent: %s", info);
        }
    });
}

module.exports = socketConnect;