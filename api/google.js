'use strict';

var request = require('request-promise');
var util = require('util');

var google = function (apiKey) {
    this.apiKey = apiKey;
};

google.prototype.getTimeZone = function (latitude, longitude) {
    var timeStamp = Math.round(Date.now() / 1000);
    var url = util.format('https://maps.googleapis.com/maps/api/timezone/json?location=%d,%d&timestamp=%d&key=%s', latitude, longitude, timeStamp, this.apiKey);
    return request(url);
};

module.exports = google;
