'use strict';

var common = {
    domain: 'http://localhost',
    port: 8080
};

var config = {
    // Web services and database
    domain: common.domain,
    webPort: common.port,
    mongoPath: 'mongodb://localhost/<collection_name>',
    mongoPort: 27017,

    // Security
    secretPhrase: '<very_secret_phrase>',

    // Job scheduler options
    maxConcurrentJobs: 100,

    // Telegram API
    botToken: '<bot_token_from_botfather>',
    adminUserID: 12345678, // User who have an access to bot's admin commands

    // HeadHunter API
    clientID: '<hh_app_client_id>',
    clientSecret: '<hh_app_client_secret>',
    userAgent: '<hh_app_name>/<hh_app_version> (<contact_email>)',
    redirect_uri: common.domain + ':' + common.port + '/auth'
};

module.exports = config;
