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

hh.prototype.createUser = function (userID, token) {
    console.log('Creating user: ' + userID);
    return new Promise(function (resolve, reject) {
        User.create({_id: userID, token: token}, function (err, user) {
            if (err)
                return reject(err);
            resolve({ok: 1, nInserted: 1, n: 1});
        });
    });
};

hh.prototype.updateUserAuthorization = function (userID, newToken) {
    console.log('Updating user: ' + userID);
    return User.update({_id: userID}, {$set: {token: newToken}}).exec();
};

hh.prototype.updatedToken = function (userID, newToken) { // TODO: Duplicate
    return User.update({_id: userID}, {$set: {token: newToken}}).exec()
        .then(function (updateStatus) {
            return newToken;
        });
};

hh.prototype.getToken = function (userID) {
    var self = this;
    return User.findOne({_id: userID}).exec()
        .then(function (user) {
            if (user) {
                var token = self.oauth2.accessToken.create(user.token);
                if (token.expired()) {
                    return token.refresh()
                        .then(function (newToken) {
                            return self.updatedToken(userID, newToken);
                        })
                }
                else
                    return user.token;
            }
            else
                throw new errors.UserError('user ' + userID + ' not found');
        });
};

hh.prototype.saveToken = function (userID, token) {
    var self = this;
    return User.findOne({_id: userID}).exec()
        .then(function (user) {
            if (user)
                return self.updateUserAuthorization(userID, token);
            else
                return self.createUser(userID, token);
        });
};

hh.prototype.authorizeUser = function (userID, code) {
    var self = this;
    return self.oauth2.authCode.getToken({
            code: code,
            redirect_uri: config.redirect_uri + '?user=' + userID,
            grant_type: 'authorization_code'
        })
        .then(function (token) {
            if (token.error)
                throw new errors.TokenError(token);
            return self.saveToken(userID, token);
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
