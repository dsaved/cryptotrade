const mysql = require('../library/mysql');
const Pagination = require('../library/MYSqlPagination');

module.exports = function(app, db_config) {

    //Get all transactions
    app.post('/transactions', async(request, response) => {
        const search = (request.body.search) ? request.body.search : null;
        let PAGE_SIZE = (request.body.result_per_page) ? Number(request.body.result_per_page) : 20;
        let page = (request.body.page) ? Number(request.body.page) : 1;

        let condition = "WHERE tr.type='buy' AND tr.completed=1";
        if (search) {
            condition += ` AND (tr.ticker LIKE '%${search}%' OR tr.base_currency LIKE '%${search}%' OR tr.base_currency LIKE '%${search}%' OR tr.type LIKE '%${search}%' OR tr.pair LIKE '%${search}%' OR tr.datetime LIKE '%${search}%' OR tr.transid = '${search}' ) `;
        }

        const paging = new Pagination(db_config);
        const db = new mysql(db_config);
        paging.rawQuery(`SELECT tr.* FROM transactions tr JOIN transactions sl ON sl.transaction_id_linked = tr.transaction_id ${condition} ORDER BY sl.datetime DESC`);
        paging.result_per_page(PAGE_SIZE);
        paging.pageNum(page)

        await paging.run();
        var results = paging.results();
        if (paging.count() > 0) {
            for (var i = 0; i < results.length; i++) {
                await db.query(`SELECT * FROM transactions WHERE transaction_id_linked=${results[i].transaction_id} LIMIT 1`);
                results[i].sale = db.results()[0];
            }
            response.status(200).json({
                success: true,
                transactions: results,
                pagination: paging.pagination()
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'No transactions found',
                pagination: paging.pagination()
            });
        }
        paging.reset();
    });


    //Get transaction by id
    app.post('/transactions/get/', async(request, response) => {
        const id = (request.body.id) ? Number(request.body.id) : null;

        if (!id) {
            response.status(403).json({
                message: 'Please provide transactions id',
                success: false
            });
            return;
        }

        const type = "buy";
        const db = new mysql(db_config);
        let queryString = `SELECT * FROM transactions WHERE transid=? AND type=?`;
        await db.query(queryString, {
            id,
            type
        });

        if (db.count() > 0) {
            var result = db.results()[0];
            await db.query(`SELECT * FROM transactions WHERE transaction_id_linked=${result.transaction_id}`);
            result.sale = db.results()[0];
            response.status(200).json({
                success: true,
                transactions: result
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'No transactions found'
            });
        }
    });

    //Get current transactions
    app.post('/transactions/current', async(request, response) => {
        const search = (request.body.search) ? request.body.search : null;
        let PAGE_SIZE = (request.body.result_per_page) ? Number(request.body.result_per_page) : 20;
        let page = (request.body.page) ? Number(request.body.page) : 1;

        let condition = "WHERE type='buy' AND completed=0 ";
        if (search) {
            condition = ` AND (ticker LIKE '%${search}%' OR base_currency LIKE '%${search}%' OR base_currency LIKE '%${search}%' OR type LIKE '%${search}%' OR pair LIKE '%${search}%' OR datetime LIKE '%${search}%' OR transid = ${search} ) `;
        }

        const paging = new Pagination(db_config);
        paging.table("transactions");
        paging.condition(condition + " ORDER BY transaction_id DESC")
        paging.result_per_page(PAGE_SIZE);
        paging.pageNum(page)

        await paging.run();
        if (paging.count() > 0) {
            response.status(200).json({
                success: true,
                transactions: paging.results(),
                pagination: paging.pagination()
            });
        } else {
            response.status(200).json({
                success: false,
                message: 'No transactions found',
                pagination: paging.pagination()
            });
        }
        paging.reset();
    });
}