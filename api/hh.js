'use strict';

var Promise = require('bluebird');
var request = require('request-promise');
var util = require('util');
var _ = require('underscore');
var OAuth2 = require('simple-oauth2');

var config = require('./../config');
var User = require('./../models/user');
var errors = require('./../errors');
var security = require('./../util/security');

var hh = function () {
    var self = this;

    self.oauth2 = new OAuth2({
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        site: 'https://hh.ru',
        tokenPath: '/oauth/token',
        authorizationPath: '/oauth/authorize'
    });
};

hh.prototype.getHeaders = function (token) {
    return {
        'Authorization': 'Bearer ' + token.access_token,
        'User-Agent': config.userAgent
    };
};

hh.prototype.getSiteInfo = function (url, token, method) {
    method = method || 'GET';
    var headers = this.getHeaders(token);
    return {method: method, url: url, headers: headers};
};

hh.prototype.getAuthorizationURL = function (userID) {
    var self = this;
    return self.oauth2.authCode.authorizeURL({
        redirect_uri: config.redirect_uri + '?user=' + userID,
        state: security.generateSecureState(userID)
    });
};

hh.prototype.createUser = function (userID, rawToken) {
    console.log('Creating user: ' + userID);
    var self = this;
    return new Promise(function (resolve, reject) {
        User.create({_id: userID, token: self.serializedToken(rawToken)}, function (err, user) {
            if (err)
                return reject(err);
            resolve({ok: 1, nInserted: 1, n: 1});
        });
    });
};

hh.prototype.updateUserAuthorization = function (userID, newRawToken) {
    console.log('Updating user: ' + userID);
    return User.update({_id: userID}, {$set: {token: this.serializedToken(newRawToken)}}).exec();
};

hh.prototype.serializedToken = function (token) {
    var result = util._extend({}, token); // cloning token object
    if ('expires_in' in result) {
        result.expires_at = new Date(Date.now() + result.expires_in * 1000).toISOString();
        delete result.expires_in;
    }
    return result;
};

hh.prototype.deserializedToken = function (token) {
    if ('expires_at' in token) {
        var expireDateMilliseconds = new Date(token.expires_at).valueOf();
        token.expires_in = Math.round((expireDateMilliseconds - Date.now()) / 1000);
        if (token.expires_in < 0)
            token.expires_in = 0;
    }
    return this.oauth2.accessToken.create(token);
};

hh.prototype.updatedToken = function (userID, newRawToken) { // TODO: Duplicate
    var serializedToken = this.serializedToken(newRawToken);
    return User.update({_id: userID}, {$set: {token: serializedToken}}).exec()
        .then(function (updateStatus) {
            return serializedToken;
        });
};

hh.prototype.getToken = function (userID) {
    var self = this;
    return User.findOne({_id: userID}).exec()
        .then(function (user) {
            if (user) {
                var token = self.deserializedToken(user.token);
                if (token.expired()) {
                    return token.refresh()
                        .then(function (rawToken) {
                            return self.updatedToken(userID, rawToken);
                        })
                }
                else
                    return user.token;
            }
            else
                throw new errors.UserError('user ' + userID + ' not found');
        });
};

hh.prototype.saveToken = function (userID, rawToken) {
    var self = this;
    return User.findOne({_id: userID}).exec()
        .then(function (user) {
            if (user)
                return self.updateUserAuthorization(userID, rawToken);
            else
                return self.createUser(userID, rawToken);
        });
};

hh.prototype.authorizeUser = function (userID, code) {
    var self = this;
    return self.oauth2.authCode.getToken({
            code: code,
            redirect_uri: config.redirect_uri + '?user=' + userID,
            grant_type: 'authorization_code'
        })
        .then(function (rawToken) {
            if (rawToken.error)
                throw new errors.TokenError(rawToken);
            return self.saveToken(userID, rawToken);
        });
};

hh.prototype.getRawResumes = function (userID) {
    var self = this;
    return self.getToken(userID)
        .then(function (token) {
            var info = self.getSiteInfo('https://api.hh.ru/resumes/mine', token);
            // TODO: Handle multiple pages
            return request(info)
                .then(function (response) {
                    // TODO: throw error if no resumes are found
                    // TODO: filter only published and valid resumes
                    return JSON.parse(response).items;
                })
        });
};

hh.prototype.filteredResume = function (resume) { // TODO: let user select fields in parameter
    return {
        id: resume.id,
        title: resume.title,
        city: resume.area.name,
        url: resume.alternate_url,
        last_update: resume.updated_at
    };
};

hh.prototype.getResumes = function (userID) {
    var self = this;
    return self.getRawResumes(userID)
        .then(function (rawResumes) {
            return _.map(rawResumes, self.filteredResume);
        });
};

hh.prototype.getResume = function (userID, resumeTitle, resumeCity) {
    var self = this;
    return self.getResumes(userID)
        .then(function (resumes) {
            for (var i = 0; i < resumes.length; i++) {
                var resume = resumes[i];
                if (resume.title === resumeTitle && resume.city === resumeCity)
                    return resume;
            }
            throw new errors.ResumeNotFoundError('resume not found');
        })
};

hh.prototype.updateResume = function (userID, resumeID) {
    var self = this;
    return self.getToken(userID)
        .then(function (token) {
            var info = self.getSiteInfo(util.format('https://api.hh.ru/resumes/%s/publish', resumeID), token, 'POST');
            return request(info);
        })
};

module.exports = hh;
