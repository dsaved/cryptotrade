const mysql = require('../library/mysql');
const Pagination = require('../library/MYSqlPagination');

module.exports = function(app, db_config) {
    //Get all uses
    app.post('/trade', async(request, response) => {
        const search = (request.body.search) ? request.body.search : null;
        let PAGE_SIZE = (request.body.result_per_page) ? Number(request.body.result_per_page) : 20;
        let page = (request.body.page) ? Number(request.body.page) : 1;

        let condition = "";
        if (search) {
            condition += ` WHERE(ticker LIKE '%${search}%' OR base_currency LIKE '%${search}%' ) `;
        }

        const paging = new Pagination(db_config);
        paging.table("trades");
        paging.condition(condition + " ORDER BY id DESC ")
        paging.result_per_page(PAGE_SIZE);
        paging.pageNum(page)

        await paging.run();
        if (paging.count() > 0) {
            response.status(200).json({
                success: true,
                trade: paging.results(),
                pagination: paging.pagination()
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'No trades found',
                pagination: paging.pagination()
            });
        }
        paging.reset();
    });

    //Get trade by id
    app.post('/trade/get/', async(request, response) => {
        const id = (request.body.id) ? Number(request.body.id) : null;

        if (!id) {
            response.status(403).json({
                message: 'Please provide trade id',
                success: false
            });
            return;
        }

        const db = new mysql(db_config);
        let queryString = `SELECT * FROM trades WHERE id=? `;
        await db.query(queryString, {
            id
        });

        if (db.count() > 0) {
            response.status(200).json({
                success: true,
                trade: db.results()[0]
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'No trades found'
            });
        }
    });

    //Create a new trade
    app.post('/trade/create/', async(request, response) => {
        const db = new mysql(db_config);
        const ticker = (request.body.ticker) ? request.body.ticker : null;
        const number_of_trades = (request.body.number_of_trades) ? request.body.number_of_trades : null;
        const buy_amount = (request.body.buy_amount) ? request.body.buy_amount : null;
        const change_percentage_buy = (request.body.change_percentage_buy) ? request.body.change_percentage_buy : null;
        const change_percentage_sell = (request.body.change_percentage_sell) ? request.body.change_percentage_sell : null;
        const auth = (request.body.auth) ? request.body.auth : null;
        const status = (request.body.status) ? request.body.status : null;
        const trading = (request.body.trading) ? request.body.trading : null;

        if (!ticker) {
            response.status(403).json({
                message: 'Please provide ticker',
                success: false
            });
            return;
        }
        if (!number_of_trades) {
            response.status(403).json({
                message: 'Please provide number_of_trades',
                success: false
            });
            return;
        }
        if (!buy_amount) {
            response.status(403).json({
                message: 'Please provide buy_amount',
                success: false
            });
            return;
        }
        if (!change_percentage_buy) {
            response.status(403).json({
                message: 'Please provide change_percentage_buy',
                success: false
            });
            return;
        }
        if (!change_percentage_sell) {
            response.status(403).json({
                message: 'Please provide change_percentage_sell',
                success: false
            });
            return;
        }
        if (!auth) {
            response.status(403).json({
                message: 'Please provide auth',
                success: false
            });
            return;
        }
        if (!status) {
            response.status(403).json({
                message: 'Please provide status',
                success: false
            });
            return;
        }
        if (!trading) {
            response.status(403).json({
                message: 'Please provide trading state',
                success: false
            });
            return;
        }

        var fs = require('fs');
        var path = require('path');
        const configPath = path.join(process.cwd(), 'config.json');
        fs.readFile(configPath, async(error, configuration) => {
            if (error) {
                response.status(200).json({
                    success: false,
                    message: 'Could not create trade'
                });
            } else {
                conf = JSON.parse(configuration);
                await db.query(`SELECT * FROM trades WHERE ticker='${ticker}'`);
                if (db.count() > 0) {
                    response.status(403).json({
                        message: `The ticker "${ticker}" already exist`,
                        success: false
                    });
                    return;
                }

                const newTradeData = {
                    ticker: ticker,
                    number_of_trades: number_of_trades,
                    base_currency: conf.base_currency,
                    buy_amount: buy_amount,
                    change_percentage_buy: change_percentage_buy,
                    change_percentage_sell: change_percentage_sell,
                    auth: auth,
                    trading: trading,
                    status: status
                }
                const done = await db.insert("trades", newTradeData);
                if (done) {
                    response.status(200).json({
                        success: true,
                        message: 'trade has been created successfully'
                    });
                } else {
                    response.status(200).json({
                        success: false,
                        message: 'Could not create trade'
                    });
                }
            }
        });
    });

    //Update an existing trade
    app.post('/trade/update/', async(request, response) => {
        const db = new mysql(db_config);
        const id = (request.body.id) ? request.body.id : null;
        const ticker = (request.body.ticker) ? request.body.ticker : null;
        const number_of_trades = (request.body.number_of_trades) ? request.body.number_of_trades : null;
        const buy_amount = (request.body.buy_amount) ? request.body.buy_amount : null;
        const change_percentage_buy = (request.body.change_percentage_buy) ? request.body.change_percentage_buy : null;
        const change_percentage_sell = (request.body.change_percentage_sell) ? request.body.change_percentage_sell : null;
        const auth = (request.body.auth) ? request.body.auth : null;
        const status = (request.body.status) ? request.body.status : null;
        const trading = (request.body.trading) ? request.body.trading : null;

        if (!id) {
            response.status(403).json({
                message: 'Please provide ticker ID',
                success: false
            });
            return;
        }
        if (!ticker) {
            response.status(403).json({
                message: 'Please provide ticker',
                success: false
            });
            return;
        }
        if (!number_of_trades) {
            response.status(403).json({
                message: 'Please provide number_of_trades',
                success: false
            });
            return;
        }
        if (!buy_amount) {
            response.status(403).json({
                message: 'Please provide buy_amount',
                success: false
            });
            return;
        }
        if (!change_percentage_buy) {
            response.status(403).json({
                message: 'Please provide change_percentage_buy',
                success: false
            });
            return;
        }
        if (!change_percentage_sell) {
            response.status(403).json({
                message: 'Please provide change_percentage_sell',
                success: false
            });
            return;
        }
        if (!auth) {
            response.status(403).json({
                message: 'Please provide auth',
                success: false
            });
            return;
        }
        if (!status) {
            response.status(403).json({
                message: 'Please provide status',
                success: false
            });
            return;
        }
        if (!trading) {
            response.status(403).json({
                message: 'Please provide trading state',
                success: false
            });
            return;
        }


        var fs = require('fs');
        var path = require('path');
        const configPath = path.join(process.cwd(), 'config.json');
        fs.readFile(configPath, async(error, configuration) => {
            if (error) {
                response.status(200).json({
                    success: false,
                    message: 'Could not create trade'
                });
            } else {
                conf = JSON.parse(configuration);
                await db.query(`SELECT * FROM trades WHERE ticker='${ticker}' AND id !=${id}`);
                if (db.count() > 0) {
                    response.status(403).json({
                        message: `The ticker "${ticker}" already exist`,
                        success: false
                    });
                    return;
                }

                const updateTradeData = {
                    ticker: ticker,
                    number_of_trades: number_of_trades,
                    base_currency: conf.base_currency,
                    buy_amount: buy_amount,
                    change_percentage_buy: change_percentage_buy,
                    change_percentage_sell: change_percentage_sell,
                    auth: auth,
                    trading: trading,
                    status: status
                }

                const done = await db.update("trades", "id", id, updateTradeData);
                if (done) {
                    response.status(200).json({
                        success: true,
                        message: 'trade has been updated successfully'
                    });
                } else {
                    response.status(200).json({
                        success: false,
                        message: 'Could not update trade'
                    });
                }
            }
        });
    });

    //Delete trade by provided list of ids
    app.post('/trade/delete/', async(request, response) => {
        let db = new mysql(db_config);
        const ids = (request.body.id) ? request.body.id : null;
        if (!ids) {
            response.status(403).json({
                message: `Plase provide ticker id or ids`,
                success: false
            });
            return;
        }

        const done = await db.delete(`trades`, `WHERE id IN (${ids})`);
        if (done) {
            response.status(200).json({
                success: true,
                message: 'Successfully deleted record'
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'Could not delete record'
            });
        }
    });

}