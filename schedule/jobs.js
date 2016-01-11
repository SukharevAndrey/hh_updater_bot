'use strict';

var util = require('util');

var HeadHunter = require('./../api/hh');
var errors = require('./../errors');
var config = require('./../config');

var hh = new HeadHunter();

var updateResume = function (userID, resumeID, bot, done) {
    console.log(util.format("Updating %s`s resume %s", userID, resumeID));
    hh.updateResume(userID, resumeID)
        .then(function (response) {
            console.log('Resume is successfully updated (status 204)');
        })
        .catch(errors.StatusCodeError, function (error) {
            switch (error.statusCode) {
                case 503:
                    console.error('HeadHunter is temporary unavailable (status 503)');
                    bot.sendMessage(userID, "Резюме не может быть обновлено, т.к. HeadHunter временно недоступен.");
                    break;
                case 429:
                    console.error("Resume can't be updated now (status 429)");
                    bot.sendMessage(userID, "Резюме не может быть обновлено по расписанию, т.к. предыдущее обновление было менее 4 часов назад.");
                    break;
                case 400:
                    console.error("Incorrect resume (status 400)");
                    bot.sendMessage(userID, "Резюме не может быть обновлено, т.к. является некорректным.");
                    break;
                case 403:
                    console.error("Authorization error (status 403)");
                    bot.sendMessage(userID, "Резюме не может быть обновлено из-за ошибки авторизации. Авторизуйтесь при помощи команды /connect.");
                    break;
                default:
                    console.error("Strange error: " + error.statusCode);
                    bot.sendMessage(userID, "Ошибка обновления резюме.");
                    break;
            }
        })
        .catch(function (error) {
            console.error(error);
            errors.handleCommon(error, userID, bot, 'Ошибка обновления резюме.');
        })
        .finally(function () {
            done();
        });
};

var defineJobs = function (scheduler) {
    console.log('Defining jobs');
    scheduler.agenda.define('update resume',
        {concurrency: config.maxConcurrentJobs}, // Because this is the only type of job yet
        function (job, done) {
            updateResume(job.attrs.data.userID, job.attrs.data.resumeID, scheduler.bot, done);
        });
};

module.exports = defineJobs;
