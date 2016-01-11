'use strict';

var Promise = require('bluebird');
var Agenda = require('agenda');
var util = require('util');

var config = require('./../config');
var timeUtil = require('./../util/time');

var scheduler = function (dbPath, bot) {
    var self = this;
    self.agenda = new Agenda({
        db: {address: dbPath},
        maxConcurrency: config.maxConcurrentJobs
    });
    self.bot = bot; // TODO: What if we want to send message somewhere else? For example on website

    Promise.promisifyAll(self.agenda);

    require('./jobs')(this);

    self.agenda.on('ready', function () {
        console.log('Agenda job scheduler started');
        self.agenda.start();
    });
};

scheduler.prototype.disableResumeUpdates = function (userID, resumeID) {
    var self = this;
    return self.agenda.cancelAsync({
        'data.userID': userID,
        'data.resumeID': resumeID
    });
};

scheduler.prototype.deleteSelectedJobs = function (jobs) {
    var self = this;
    var jobIds = [];
    for (var i = 0; i < jobs.length; i++) {
        jobIds.push(jobs[i].attrs._id);
    }
    return self.agenda.cancelAsync({_id: {$in: jobIds}});
};

scheduler.prototype.scheduleUpdates = function (userID, resumeID, timeList, timeZone) {
    var self = this;
    return self.agenda.jobsAsync({
            'name': 'update resume',
            'data.userID': userID,
            'data.resumeID': resumeID
        })
        .then(function (existingJobs) {
            var jobCreatePromises = [];
            var newJobs = [];
            for (var i = 0; i < timeList.length; i++) {
                var job = self.createJob(userID, resumeID, timeList[i], timeZone);
                newJobs.push(job);
                jobCreatePromises.push(job.saveAsync());
            }

            return Promise.all(jobCreatePromises)
                .then(function () {
                    return self.deleteSelectedJobs(existingJobs);
                })
                .then(function (deletedCount) {
                    console.log('Deleted ' + deletedCount + ' old updates');
                    return jobCreatePromises.length;
                });
            // TODO: Catch db error and delete created jobs
        })
};

scheduler.prototype.getSecondsDelay = function (time) {
    const totalDayMinutes = 1440;
    var dayMinute = time.hh * 60 + time.mm;
    var delay = Math.floor((dayMinute / totalDayMinutes) * 60);

    if (delay < 10)
        return '0' + delay;
    else
        return delay.toString();
};

scheduler.prototype.createJob = function (userID, resumeID, time, timeZone) {
    var job = this.agenda.create('update resume', {
        userID: userID,
        resumeID: resumeID
    });

    var tzOffset = timeUtil.getTimezoneOffset(timeZone);
    var timeObj = new timeUtil.Time(time).shift(tzOffset);
    var secondsDelay = this.getSecondsDelay(timeObj);

    var scheduleTime = util.format('at %s:%s', timeObj.toString(), secondsDelay);
    job.schedule(scheduleTime);
    job.repeatEvery('1 day');

    return Promise.promisifyAll(job);
};

scheduler.prototype.getResumeScheduleTimes = function (resumeID) {
    var self = this;
    return self.agenda.jobsAsync({'name': 'update resume', 'data.resumeID': resumeID})
        .then(function (existingJobs) {
            var times = [];
            for (var i = 0; i < existingJobs.length; i++) {
                times.push(existingJobs[i].attrs.nextRunAt);
            }
            return times;
        });
};

module.exports = scheduler;
