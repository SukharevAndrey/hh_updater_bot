'use strict';

var TelegramBot = require('node-telegram-bot-api');
var Promise = require('bluebird');
var moment = require('moment-timezone');
var util = require('util');

var config = require('./config');
var HeadHunter = require('./api/hh');
var Scheduler = require('./schedule/scheduler');
var StateManager = require('./util/state');
var timeUtil = require('./util/time');
var errors = require('./errors');

var botOptions = {
    polling: true
};

var hh = new HeadHunter();
var bot = new TelegramBot(config.botToken, botOptions);
var scheduler = new Scheduler(config.mongoPath, bot);
var stateManager = new StateManager();

moment.locale('ru');

var commandsDescription =
    ['/connect - Предоставить боту доступ к вашим резюме через OAuth 2',
        '/resumes - Показать список резюме и текущее расписание их обновлений',
        '/manageupdates - Управление автообновлением резюме',
        '/timezone - Выбрать часовой пояс (по умолчанию - Москва)',
        '/help - Показать список допустимых команд и их описание',
        '/cancel - Отменить текущую операцию'];

var keyboardHideParams = {
    parse_mode: 'Markdown',
    reply_markup: {hide_keyboard: true}
};

var keyboardShowParams = {
    parse_mode: 'Markdown',
    reply_markup: {hide_keyboard: false}
};

var getHelpMessage = function () {
    var response = 'Список доступных команд:\n\n';
    response += commandsDescription.join('\n');
    return response;
};

var getWelcomeMessage = function () {
    var message = 'Вас приветствует бот, который будет автоматически обновлять ваши резюме на HeadHunter в заданное вами время.\n\n';
    message += getHelpMessage();
    return message;
};

var getAuthMessage = function (userID) {
    var authURL = hh.getAuthorizationURL(userID);
    return 'Пройдите по следующей ссылке для авторизации:\n' + authURL;
};

var getTimeMessage = function (resume) {
    var response = util.format("Перечислите через запятую время для обновления резюме [%s](%s)\n",
        resume.title, resume.url);
    response += "_Пример_: 09:00, 13:00, 17:00\n";
    response += "*Обратите внимание*:\n";
    response += "1. Интервал между обновлениями должен составлять _не менее 4 часов_;\n";
    response += "2. В день может быть не более 5 запланированных обновлений;\n";
    response += "3. Предыдущее расписание обновлений будет _перезаписано_ новым.\n";
    return response;
};

var getResumeInfo = function (resume, resumeNum) {
    var num = resumeNum;

    return scheduler.getResumeScheduleTimes(resume.id)
        .then(function (times) {
            // TODO: User defined timezone
            var info = util.format('%d. [%s](%s) (%s):\n', num + 1, resume.title, resume.url, resume.city);
            var prettyDate = moment.tz(resume.last_update, "Europe/Moscow").format('D MMMM YYYY г. в HH:mm');
            info += "Последнее обновление: _" + prettyDate + "_\n";

            if (times.length === 0)
                info += '*Автоматическое обновление отключено*';
            else {
                var prettyTimes = [];
                for (var i = 0; i < times.length; i++) {
                    prettyTimes.push(moment.tz(times[i], "Europe/Moscow").format('D MMMM HH:mm'));
                }
                info += '*Ближайшие обновления*: ' + prettyTimes.join(', ');
            }
            return info;
        });
};

var getResumeFromMessage = function (userID, resumeInfo) {
    var resumeNameRegex = /(.+) \((.+)\)/;
    var res = resumeInfo.match(resumeNameRegex);

    if (res) {
        var title = res[1];
        var city = res[2];
        return hh.getResume(userID, title, city);
    }
    else
        return new Promise.reject(new errors.ResumeFormatError('invalid resume info format'));
};

var checkTime = function (time) {
    var t = new timeUtil.Time(time);
    if (t.hh >= 0 && t.hh <= 23 && t.mm >= 0 && t.mm <= 59)
        return true;
    else
        return false;
};

var areTimeIntervalsValid = function (times) {
    if (times.length === 1)
        return true;

    var fail = false;
    for (var i = 0; i < times.length; i++) {
        var t1 = new timeUtil.Time(times[i]);
        var t2 = new timeUtil.Time(times[(i + 1) % times.length]);
        var diff = t1.diff(t2);

        if (diff[0] < 4) {
            fail = true;
            break;
        }
    }
    return !fail;
};

var parseTimes = function (message) {
    // TODO: what if sync error happens?
    //return new Promise.resolve()
    //    .then(function() {
    //
    //    });
    return new Promise(function (resolve, reject) {
        var timeRegex = /(\d\d:\d\d)/;
        var parsedTimes = [];
        var fail = false;

        var rawTimes = message.trim().split(',');
        if (rawTimes.length > 5) {
            return reject(new errors.TimeFormatError('too many times'));
        }
        for (var i = 0; i < rawTimes.length; i++) {
            var time = rawTimes[i].trim(); // TODO: Handle empty times
            var matchResult = time.match(timeRegex);
            if (matchResult && matchResult[1].length === time.length) {
                if (checkTime(time))
                    parsedTimes.push(time);
                else {
                    fail = true;
                    break;
                }
            }
            else {
                fail = true;
                break;
            }
        }
        if (fail) {
            reject(new errors.TimeFormatError('wrong format'));
        }
        else {
            parsedTimes.sort();
            if (areTimeIntervalsValid(parsedTimes))
                resolve(parsedTimes);
            else
                reject(new errors.TimeFormatError('too small intervals'));
        }
    });

};

var handleResumeSelection = function (userID, message) {
    getResumeFromMessage(userID, message)
        .then(function (resume) {
            stateManager.setResume(userID, resume.id);
            stateManager.setState(userID, "time selection");
            var params = {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {
                    keyboard: [['Отключить автообновление']], // TODO: Don't show if there are no scheduled updates
                    one_time_keyboard: true, // hide after selecting
                    resize_keyboard: true // don't fill all space
                }
            };
            return bot.sendMessage(userID, getTimeMessage(resume), params);
        })
        .catch(errors.ResumeNotFoundError, function (error) {
            console.error(error);
            bot.sendMessage(userID, "Резюме не найдено.", keyboardShowParams);
        })
        .catch(errors.ResumeFormatError, function (error) {
            console.error(error);
            bot.sendMessage(userID, "Некорректный формат резюме.", keyboardShowParams);
        })
        .catch(function (error) {
            console.error(error);
            errors.handleCommon(error, userID, bot);
        });
};

var handleTimeSelection = function (userID, rawTimesMessage) {
    var resumeID = stateManager.getResume(userID);

    // TODO: move logic to parseTimes then handling
    if (rawTimesMessage === 'Отключить автообновление') {
        return scheduler.disableResumeUpdates(userID, resumeID)
            .then(function (deletedCount) {
                console.log(util.format('User %d has disabled auto updates (deleted %d jobs)', userID, deletedCount));
                return bot.sendMessage(userID, "Автообновление данного резюме отключено.", keyboardHideParams);
            })
            .catch(function (error) {
                console.error(error);
                errors.handleCommon(error, userID, bot, "Ошибка отключения автообновления. Попробуйте позже.");
            });
    }

    parseTimes(rawTimesMessage)
        .then(function (times) {
            // TODO: Get user's timezone from database
            scheduler.scheduleUpdates(userID, resumeID, times, 'Europe/Moscow')
                .then(function (scheduledUpdatesCount) {
                    var timesString = times.join(', ');
                    console.log(util.format('%d scheduled %d updates: %s', userID, scheduledUpdatesCount, timesString));
                    var response = "Теперь ваше резюме будет автоматически обновляться каждый день в " + timesString;
                    response += "\nЕсли резюме не сможет быть обновлено по расписанию, вам будет прислано сообщение.";
                    stateManager.setState(userID, 'start');
                    return bot.sendMessage(userID, response, keyboardHideParams);
                })
        })
        .catch(errors.TimeFormatError, function (error) {
            console.error(error);
            switch (error.message) {
                case "too small intervals":
                    bot.sendMessage(userID, "Интервал между обновлениями должен быть не менее 4 часов.");
                    break;
                case "wrong format":
                    bot.sendMessage(userID, "Неправильный формат входных данных."); // TODO: print right format
                    break;
                case "too many times":
                    bot.sendMessage(userID, "В один день может быть не более 5 запланированных обновлений.");
                    break;
            }
        })
        .catch(function (error) {
            console.error(error);
            errors.handleCommon(error, userID, bot);
        });
};

var isCommand = function (msg) {
    var trimmed_msg = msg.trim();

    if (trimmed_msg && trimmed_msg[0] == '/')
        return true;
    else
        return false;
};

bot.onText(/\/start/, function (msg) {
    var userID = msg.from.id;
    bot.sendMessage(userID, getWelcomeMessage(userID));
});

bot.onText(/\/connect/, function (msg) {
    var userID = msg.from.id;
    bot.sendMessage(userID, getAuthMessage(userID));
});

bot.onText(/\/resumes/, function (msg) {
    var userID = msg.from.id;
    hh.getResumes(userID)
        .then(function (resumes) {
            if (resumes.length === 0) {
                return bot.sendMessage(userID, "У вас нет созданных резюме.");
            }
            else {
                var infoPromises = [];
                for (var i = 0; i < resumes.length; i++) {
                    var resume = resumes[i];
                    infoPromises.push(getResumeInfo(resume, i));
                }
                return Promise.all(infoPromises)
                    .then(function (infos) {
                        var response = infos.join('\n');
                        return bot.sendMessage(userID, response, {
                            parse_mode: 'Markdown',
                            disable_web_page_preview: true
                        });
                    });
            }
        })
        .catch(function (error) {
            console.error(error);
            errors.handleCommon(error, userID, bot);
        })
});

bot.onText(/\/manageupdates/, function (msg) {
    var userID = msg.from.id;
    hh.getResumes(userID)
        .then(function (resumes) {
            if (resumes.length === 0)
                return bot.sendMessage(userID, "У вас нет созданных резюме.");
            else {
                var resumeKeyboard = [];
                for (var i = 0; i < resumes.length; i++) {
                    var resume = resumes[i];
                    resumeKeyboard.push([util.format('%s (%s)', resume.title, resume.city)]);
                }
                var params = {
                    reply_markup: {
                        keyboard: resumeKeyboard,
                        resize_keyboard: true // don't fill all the space
                    }
                };
                stateManager.setState(userID, 'resume selection');
                return bot.sendMessage(userID, "Выберите резюме, для которого вы хотите задать автообновление:", params);
            }
        })
        .catch(function (error) {
            console.error(error);
            errors.handleCommon(error, userID, bot, "Ошибка получения списка резюме.");
        });
});

bot.onText(/\/timezone/, function (msg) {
    var userID = msg.from.id;
    bot.sendMessage(userID, "Пока не реализовано. Ваши резюме будут обновляться по московскому времени.");
});

bot.onText(/\/help/, function (msg) {
    var userID = msg.from.id;
    bot.sendMessage(userID, getHelpMessage(userID));
});

bot.onText(/\/cancel/, function (msg) {
    var userID = msg.from.id;
    var currentState = stateManager.getState(userID);

    if (currentState == 'start')
        bot.sendMessage(userID, "Нет операций для отмены", keyboardHideParams);
    else {
        stateManager.setState(userID, 'start');
        bot.sendMessage(userID, 'Операция успешно отменена', keyboardHideParams);
    }
});

bot.on('text', function (msg) {
    if (isCommand(msg.text))
        return;

    // TODO: Handle incorrect commands
    var userID = msg.from.id;
    switch (stateManager.getState(userID)) {
        case "start":
            break;
        case "resume selection":
            handleResumeSelection(userID, msg.text);
            break;
        case "time selection":
            handleTimeSelection(userID, msg.text);
            break;
        default:
            console.error('unknown state');
            break;
    }
});

console.log('Bot is initialized');

module.exports = bot;
