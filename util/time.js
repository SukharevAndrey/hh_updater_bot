'use strict';

var moment = require('moment-timezone');

var Time = function (rawTime) {
    var parsed = rawTime.split(':');
    this.hh = parseInt(parsed[0]);
    this.mm = parseInt(parsed[1]);
};

Time.prototype.diff = function (other) {
    var diffHours = 0;
    var diffMinutes = 0;

    if (this.hh < other.hh) {
        diffHours = other.hh - this.hh;
    }
    else { // this.hh >= other.hh
        diffHours = other.hh + 24 - this.hh;
    }

    if (this.mm > other.mm) {
        diffMinutes = other.mm + 60 - this.mm;
        diffHours -= 1;
    }
    else {
        diffMinutes = other.mm - this.mm;
    }

    if (diffHours == 24)
        diffHours = 0;

    return [diffHours, diffMinutes];
};

Time.prototype.shift = function (offset) {
    var sign = 1;
    if (offset < 0) {
        sign = -1;
        offset = -offset;
    }
    var hours = Math.floor(offset / 60);
    var minutes = offset % 60;

    var res = new Time(this.hh + ':' + this.mm);
    var oldMM = res.mm;
    if (sign > 0) {
        res.hh = (res.hh + hours) % 24;
        res.mm = (res.mm + minutes) % 60;
        if (oldMM + minutes >= 60)
            res.hh = (res.hh + 1) % 24;
    }
    else {
        res.hh = (res.hh + 24 - hours) % 24;
        res.mm = (res.mm + 60 - minutes) % 60;
        if (oldMM - minutes < 0)
            res.hh = (res.hh + 24 - 1) % 24;
    }
    return res;
};

var normalize = function(s) {
    if (s.toString().length == 1)
        return '0' + s;
    else
        return s;
};

Time.prototype.toString = function () {
    return normalize(this.hh) + ':' + normalize(this.mm);
};

var getTimeZoneOffset = function(timeZone) {
    var serverUtcOffset = new Date().getTimezoneOffset();
    var userUtcOffset = moment.tz.zone(timeZone).offset(Date.now());
    return userUtcOffset - serverUtcOffset;
};

exports.Time = Time;
exports.getTimezoneOffset = getTimeZoneOffset;