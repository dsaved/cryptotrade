module.exports = {
    apps: [{
        name: "CRYPTO TRADING",
        script: "./app.js",
        watch: false,
        env: {
            "NODE_ENV": "development",
        },
        env_production: {
            "NODE_ENV": "production"
        }
    }]
}