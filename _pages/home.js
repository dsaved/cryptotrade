const mysql = require('../library/mysql');
const utils = require('../library/utils.js');
var fs = require('fs');
var path = require('path');

module.exports = function(app, db_config) {
    const configPath = path.join(process.cwd(), 'config.json');
    app.get('/', async(request, response) => {
        response.status(200).json({
            success: true,
            message: 'You seccuessfuly connected to the api'
        });
    });

    app.post('/home/stats', async(request, response) => {

        var total_num_trans = 0;
        var total_num_trading = 0;
        var total_profit = 0;
        const db = new mysql(db_config);

        await db.query(`SELECT * FROM transactions `);
        total_num_trans = db.count();

        await db.query(`SELECT tr.* FROM trades td JOIN transactions tr ON tr.ticker=td.ticker WHERE tr.type='buy' AND tr.completed=0 `);
        total_num_trading = db.count();

        await db.query(`SELECT SUM(symbol2Amount) total_buy FROM transactions WHERE completed=1`);
        if (db.count() > 0) {
            const total_buy = db.results()[0].total_buy;
            await db.query(`SELECT SUM(symbol2Amount) total_sell FROM transactions WHERE type='sell'`);
            const total_sell = db.results()[0].total_sell;
            total_profit = parseFloat(total_sell) - parseFloat(total_buy);
        }

        var pie_chart_data = [];
        await db.query(`SELECT ticker FROM trades`);
        if (db.count() > 0) {
            let index = 0;
            const trades = db.results();
            while (index < trades.length) {
                const trans_data = trades[index];
                await db.query(`SELECT COUNT(transaction_id) count FROM transactions WHERE type='buy' AND completed=1 AND ticker='${trans_data.ticker}'`);
                if (db.count() > 0) {
                    const count_ticker = db.results()[0].count;
                    pie_chart_data.push({
                        name: trans_data.ticker,
                        count: count_ticker
                    })
                } else {
                    pie_chart_data.push({
                        name: trans_data.ticker,
                        count: 0
                    })
                }
                index++;
            }
        }

        var sum_pie_chart = (pie_chart_data.reduce((a, b) => a + b.count, 0));
        pie_chart_data.forEach((chart_data, index) => {
            const count = chart_data.count;
            const percentage = (count / sum_pie_chart) * 100;
            pie_chart_data[index].percentage = `${parseInt(percentage)}%`;
        });

        //cash gain daily
        var bar_chart_data = [];
        await db.query(`SELECT SUM(symbol2Amount) total_sell, GROUP_CONCAT(transaction_id_linked) as transaction_id_linked, DATE(datetime) AS date_time FROM transactions WHERE type='sell' AND DATE(datetime) BETWEEN DATE_SUB(DATE_FORMAT(NOW(), "%Y-%m-%d"), INTERVAL 7 DAY) AND DATE_FORMAT(NOW(), "%Y-%m-%d") GROUP BY date_time ORDER BY date_time`);
        if (db.count() > 0) {
            const total_sales = db.results();
            for (let index = 0; index < total_sales.length; index++) {
                const element = total_sales[index];
                await db.query(`SELECT SUM(symbol2Amount) total_buy FROM transactions WHERE completed=1 AND transaction_id IN (${element.transaction_id_linked})`);
                const total_buy = db.results()[0].total_buy;
                const total_profit = parseFloat(element.total_sell) - parseFloat(total_buy);
                bar_chart_data.push({
                    date: element.date_time,
                    profit: parseFloat(total_profit).toFixed(2)
                })
            }
        }

        //cash gain daily
        var top_crypto_data = [];
        await db.query(`SELECT COUNT(*) number, ticker FROM transactions WHERE type='sell' GROUP BY ticker ORDER BY number DESC LIMIT 3 `);
        if (db.count() > 0) {
            const top_performing = db.results();
            for (let index = 0; index < top_performing.length; index++) {
                const element = top_performing[index];
                top_crypto_data.push({
                    count: utils.abbreviateNumber(element.number),
                    name: element.ticker
                })
            }
        }

        response.status(200).json({
            success: true,
            stats: {
                total_number_of_transactions: total_num_trans,
                total_num_trading: total_num_trading,
                total_profit: parseFloat(total_profit).toFixed(2),
                pie_chart: pie_chart_data,
                bar_chart: bar_chart_data,
                top_crypto: top_crypto_data
            }
        });
    });

    app.post('/home/auth-option', async(request, response) => {
        var configuration = fs.readFileSync(configPath);
        var conf = JSON.parse(configuration);
        response.status(200).json({
            success: true,
            options: Object.keys(conf.api_authentications)
        });
    });

    app.post('/home/settings', async(request, response) => {
        var configuration = fs.readFileSync(configPath);
        var conf = JSON.parse(configuration);
        response.status(200).json({
            success: true,
            auths: conf.api_authentications,
            currency: conf.base_currency
        });
    });

    app.post('/home/update-basecurrency', async(request, response) => {
        const baseCurrency = (request.body.currency) ? request.body.currency : null;
        if (!baseCurrency) {
            response.status(403).json({
                message: `Plase provide Base Currency`,
                success: false
            });
            return;
        }
        var configuration = fs.readFileSync(configPath);
        var conf = JSON.parse(configuration);
        conf.base_currency = baseCurrency;
        let data = JSON.stringify(conf, null, 2);
        fs.writeFileSync('config.json', data);
        response.status(200).json({
            success: true,
            message: "Successfully updated"
        });
    });
}