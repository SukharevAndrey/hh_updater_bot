'use strict';

var util = require('util');
var requestErrors = require('request-promise/errors');

function TokenError(info) {
    this.name = 'TokenError';
    this.type = info['error'];
    this.message = info['error_description'] || '';
    Error.captureStackTrace(this, TokenError);
}
util.inherits(TokenError, Error);

function AuthError(message) {
    this.name = 'AuthError';
    this.message = message || '';
    Error.captureStackTrace(this, AuthError);
}
util.inherits(AuthError, Error);

function UserError(message) {
    this.name = 'UserError';
    this.message = message || '';
    Error.captureStackTrace(this, UserError);
}
util.inherits(UserError, Error);

function ResumeNotFoundError(message) {
    this.name = 'ResumeNotFoundError';
    this.message = message || '';
    Error.captureStackTrace(this, ResumeNotFoundError);
}
util.inherits(ResumeNotFoundError, Error);

function ResumeFormatError(message) {
    this.name = 'ResumeFormatError';
    this.message = message || '';
    Error.captureStackTrace(this, ResumeFormatError);
}
util.inherits(ResumeFormatError, Error);

function TimeFormatError(message) {
    this.name = 'TimeFormatError';
    this.message = message || '';
    Error.captureStackTrace(this, TimeFormatError);
}
util.inherits(TimeFormatError, Error);

var handleCommonErrors = function (error, userID, bot, defaultMsg) {
    defaultMsg = defaultMsg || "Внутренняя ошибка бота.";
    switch (error.name) {
        case "MongoError":
        case "MongooseError":
            return bot.sendMessage(userID, "Внутренняя ошибка бота. База данных недоступна.");
        case "TokenError":
            switch (error.message) {
                case 'code has already been used':
                    return bot.sendMessage(userID, "Ошибка авторизации. Повторное прохождение по ответной ссылке.");
                default:
                    return bot.sendMessage(userID, "Ошибка авторизации. Не удалось получить токен.");
            }
        case "UserError":
            return bot.sendMessage(userID, "Вы не авторизованы. Пожалуйста, авторизуйтесь при помощи команды /connect.");
        case "StatusCodeError":
            // TODO: We need moar codes!
            switch (error.statusCode) {
                case 503:
                    return bot.sendMessage(userID, "HeadHunter временно недоступен.");
                case 404:
                    return bot.sendMessage(userID, "На HeadHunter произошли изменения, которые бот пока не поддерживает.");
                case 403:
                    return bot.sendMessage(userID, "Вы не авторизованы. Пожалуйста, авторизуйтесь при помощи команды /connect.");
                default:
                    return bot.sendMessage(userID, "Ошибка сервиса. Повторите попытку позднее.");
            }
        default:
            return bot.sendMessage(userID, defaultMsg);
    }
};

module.exports = {
    TokenError: TokenError,
    AuthError: AuthError,
    UserError: UserError,
    ResumeNotFoundError: ResumeNotFoundError,
    StatusCodeError: requestErrors.StatusCodeError,
    ResumeFormatError: ResumeFormatError,
    TimeFormatError: TimeFormatError,
    handleCommon: handleCommonErrors
};
