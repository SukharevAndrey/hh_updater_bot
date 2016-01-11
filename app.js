'use strict';

var express = require('express');
var mongoose = require('mongoose');
var Promise = require('bluebird');
// TODO: Promisify the whole mongoose

var config = require('./config');
var HeadHunter = require('./api/hh');
var bot = require('./bot');
var security = require('./util/security');
var errors = require('./errors');

mongoose.Promise = require('bluebird'); // using bluebird as mongoose default promise library
mongoose.connect(config.mongoPath, function (err) {
    if (err)
        console.log('Could not connect to MongoDB. Ensure that you have mongodb running and it accepts connections on port from config!');
    else
        console.log('Connection to MongoDB successful');
});

var app = express();
var hh = new HeadHunter();

var authorizeUser = function (req, res) {
    var code = req.query.code;
    var userID = req.query.user;
    var error = req.query.error;
    var state = req.query.state;

    var response = res;

    if (!security.isValidState(state, userID)) {
        response.send("Некорректная ссылка. Пожалуйста, получите новую при помощи команды /connect");
        return;
    }

    Promise.resolve()
        .then(function () {
            if (error) {
                // TODO: Don't throw is user is already correctly authorized
                throw new errors.AuthError(error);
            }

            return hh.authorizeUser(userID, code)
                .then(function (info) {
                    console.log('User ' + userID + ' authorization status: ' + JSON.stringify(info));
                    if (info.n === 1)
                        return bot.sendMessage(userID, "Вы успешно авторизовались. Теперь вам доступно автообновление резюме.");
                    else
                        return bot.sendMessage(userID, "Ошибка авторизации. Попробуйте авторизоваться снова при помощи /connect.");
                })
        })
        .catch(errors.AuthError, function(error) {
            console.error(error);
            switch (error.message) {
                case "access_denied":
                    return bot.sendMessage(userID, "Вы не дали боту доступ к вашим резюме. Без него бот ничего не сможет сделать :-(");
                default:
                    return bot.sendMessage(userID, "Ошибка авторизации. Попробуйте авторизоваться снова при помощи /connect.");
            }
        })
        .catch(function (error) {
            console.error(error);
            var defaultMsg = "Ошибка авторизации. Попробуйте авторизоваться снова при помощи /connect.";
            errors.handleCommon(error, userID, bot, defaultMsg);
        })
        .finally(function () {
            console.log('Closing auth page');
            response.send("<script>window.close()</script>");
        })
};

app.get('/auth', authorizeUser);

app.listen(config.webPort);
console.log('Web server started on port ' + config.webPort);

module.exports = app;
