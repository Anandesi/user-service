'use strict';

var Q = require('q');
var keys = require('../config/keys');
var constants = require('../config/constants.json');
var jsdom = require("jsdom");
var fs = require("fs");
var sendgrid = require('sendgrid')(global.keys.sendgridApiKey);

var nodemailer = require('nodemailer');
var mailgun = require('nodemailer-mailgun-transport');
var nodemailerMailgun = nodemailer.createTransport(mailgun({
	auth: {
		api_key: keys.mailGunApiKey,
		domain: keys.mailGunDomain
	}
}));

module.exports = function() {

	return {

		sendTextMail: function(from, to, subject, text) {

			console.log("Send Mail Function...");
			var deferred = Q.defer();

			nodemailerMailgun.sendMail({
				from: from,
				'h:Reply-To': constants.supportEmail,
				to: to,
				subject: subject,
				text: text
			}, function(err, info) {
				if (err) {
					console.log(err);
					deferred.reject(err);
				} else {
					console.log(info);
					deferred.resolve(info);
				}
			});

			return deferred.promise;
		},

		sendMail: function(mailName, emailTo, subject, variableArray) {

			console.log("Send Mail Function...");

			var deferred = Q.defer();

			try {

				_getEmailTemplate(mailName).then(function(template) {

					if (template) {
						return _mergeVariablesInTemplate(template, variableArray);
					} else {
						var noTempDef = Q.defer();
						noTempDef.reject(mailName + " template not found");
						return noTempDef.promise;
					}

				}).then(function(mergedTemplate) {
					var emailRequest = _buildSendGridMailRequest(emailTo, subject, mergedTemplate);
					sendgrid.API(emailRequest, function(err, info) {
						if (err) {
							console.log(err);
							deferred.reject(err);
						} else {
							console.log(info);
							deferred.resolve(info);
						}
					});

				}, function(error) {
					console.log(error);
					deferred.reject(error);
				});

			} catch (err) {
				deferred.reject(err);
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
			}

			return deferred.promise;
		},

		sendSignupMail: function(user) {
			var mailName = "signupwelcome";
			var emailTo = user.email;
			var subject = "Welcome to CloudBoost";

			var variableArray = [{
				"domClass": "username",
				"content": user.name,
				"contentType": "text"
			}, {
				"domClass": "link",
				"content": "<a href='" + process.env["ACCOUNTS_URL"] + "/activate?code=" + user.emailVerificationCode + "' class='btn-primary'>Activate your account</a>",
				"contentType": "html"
			}];

			this.sendMail(mailName, emailTo, subject, variableArray);
		},

		sendActivationMail: function(user) {
			var mailName = "accountactivated";
			var emailTo = user.email;
			var subject = "Your account is now activated";

			var variableArray = [{
				"domClass": "username",
				"content": user.name,
				"contentType": "text"
			}];

			this.sendMail(mailName, emailTo, subject, variableArray);
		},

		sendResetPasswordMail: function(user) {
			var mailName = "forgotpassword";
			var emailTo = user.email;
			var subject = "Reset your password";

			var variableArray = [{
				"domClass": "username",
				"content": user.name,
				"contentType": "text"
			}, {
				"domClass": "link",
				"content": "<a href='" + process.env["ACCOUNTS_URL"] + "/changepassword?code=" + user.emailVerificationCode + "' class='btn-primary'>Reset your password</a>",
				"contentType": "html"
			}];

			this.sendMail(mailName, emailTo, subject, variableArray);
		},

		sendUpdatePasswordMail: function(user) {
			var mailName = "passwordchanged";
			var emailTo = user.email;
			var subject = "You've changed your password";

			var variableArray = [{
				"domClass": "username",
				"content": user.name,
				"contentType": "text"
			}];

			this.sendMail(mailName, emailTo, subject, variableArray);
		}

	};

};

/***********************************Private Functions**********************************/

function _mergeVariablesInTemplate(template, variableArray) {

	var deferred = Q.defer();

	try {

		//Parse Template
		jsdom.env(template, [], function(error, window) {
			if (error) {
				deferred.reject("Cannot parse mail template.");
			} else {

				var $ = require('jquery')(window);

				for (var i = 0; i < variableArray.length; ++i) {

					if (variableArray[i].contentType === "text") {
						$("." + variableArray[i].domClass).text(variableArray[i].content);
					} else if (variableArray[i].contentType === "html") {
						$("." + variableArray[i].domClass).html(variableArray[i].content);
					}

				}

				deferred.resolve(window.document.documentElement.outerHTML);
			}
		});

	} catch (err) {
		global.winston.log('error', {
			"error": String(err),
			"stack": new Error().stack
		});
		deferred.reject(err);
	}

	return deferred.promise;
}

function _getEmailTemplate(templateName) {
	var deferred = Q.defer();

	var templatePath = './mail-templates/' + templateName + '.html';

	try {
		fs.readFile(templatePath, 'utf8', function(error, data) {
			if (error) {
				deferred.reject(error);
			} else if (data) {
				deferred.resolve(data);
			}
		});

	} catch (err) {
		global.winston.log('error', {
			"error": String(err),
			"stack": new Error().stack
		});
		deferred.reject(err);
	}

	return deferred.promise;
}

function _buildSendGridMailRequest(emailTo, subject, mergedTemplate) {
	return sendgrid.emptyRequest({
		method: 'POST',
		path: '/v3/mail/send',
		body: {
			personalizations: [{
				to: [{
					email: emailTo
				}],
				subject: subject
			}],
			from: {
				email: keys.adminEmailAddress,
				name: "CloudBoost.io"
			},
			"reply_to": {
				email: constants.supportEmail,
				name: "CloudBoost.io"
			},
			content: [{
				type: 'text/html',
				value: mergedTemplate
			}]
		}
	});
}
