'use strict';

var Q = require('q');
var keys = require('../config/keys');
var _ = require('underscore');
var request = require('request');
var randomString = require('random-string');

var utils = require('../helpers/utils');

module.exports = function(Project, User) {

	return {

		createProject: function(name, userId, cloudProvider) {

			console.log("Create project/app");

			var _self = this;

			var deferred = Q.defer();

			try {

				var appId;
				var newAppPlanId = 1;

				generateNonExistingAppId().then(function(newAppId) {
					console.log("Fetched new AppId");
					appId = newAppId;
					return _createAppFromDS(appId);

				}).then(function(project) {

					console.log("Successfull on create app from data service..");
					console.log("Project as string..");
					console.log(project);
					project = JSON.parse(project);
					console.log("Project as JSON");
					console.log(project);
					//Adding default developer
					var developers = [];
					var newDeveloper = {};
					newDeveloper.userId = userId;
					newDeveloper.role = "Admin";
					developers.push(newDeveloper);
					//End Adding default developer

					var appendJson = {
						_userId: userId,
						name: name,
						developers: developers,
						planId: newAppPlanId,
						disabled: false,
						lastActive: Date.now(),
						deleted: false,
						deleteReason: 'Active'
					};

					if (cloudProvider && cloudProvider.provider) {
						appendJson.provider = cloudProvider.provider;
					}

					if (cloudProvider && cloudProvider.providerProperties) {
						appendJson.providerProperties = cloudProvider.providerProperties;
					}

					return _self.findOneAndUpdateProject(project._id, appendJson);

				}).then(function(newProject) {

					console.log("Successfull on save new project");

					deferred.resolve(newProject);
					_createPlanInAnalytics(appId, newAppPlanId);

				}, function(error) {
					console.log("Error on create new project");
					console.log(error);
					deferred.reject(error);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				console.log(err);
				deferred.reject(err);
			}

			return deferred.promise;
		},

		blockProject: function(appId, reason) {

			var deferred = Q.defer();

			try {
				var post_data = {};

				post_data.host = global.keys.secureKey;
				post_data.appId = global.keys.appId;
				post_data.reason = global.keys.reason;

				post_data = JSON.stringify(post_data);

				var url = global.keys.analyticsServiceUrl + '/app/block';
				request.post(url, {
					headers: {
						'content-type': 'application/json',
						'content-length': post_data.length
					},
					body: post_data
				}, function(err, response, body) {
					if (err || response.statusCode === 500 || body === 'Error') {
						console.log("Error on block app from analytics service");
						console.log(err);
						deferred.reject(err);
					} else {
						console.log("Successful on block app from analytics services.");
						try {
							deferred.resolve(body);
						} catch (e) {
							deferred.reject(e);
						}
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
		},

		unblockProject: function(appId) {
			var deferred = Q.defer();

			try {
				var post_data = {};

				post_data.host = global.keys.secureKey;
				post_data.appId = global.keys.appId;

				post_data = JSON.stringify(post_data);

				var url = global.keys.analyticsServiceUrl + '/app/unblock';
				request.post(url, {
					headers: {
						'content-type': 'application/json',
						'content-length': post_data.length
					},
					body: post_data
				}, function(err, response, body) {
					if (err || response.statusCode === 500 || body === 'Error') {
						console.log("Error on unblock app from analytics service");
						console.log(err);
						deferred.reject(err);
					} else {
						console.log("Successful on unblock app from analytics services.");
						try {
							deferred.resolve(body);
						} catch (e) {
							deferred.reject(e);
						}
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
		},

		projectList: function(userId) {

			console.log("Get project list for..", userId);

			var deferred = Q.defer();

			try {

				Project.find({
					developers: {
						$elemMatch: {
							userId: userId
						}
					},
					deleted: false
				}, function(err, list) {
					if (err) {
						console.log("Error on Get project list..");
						deferred.reject(err);
					}
					console.log("Success on Get project list..");
					deferred.resolve(list);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},

		getProjectByUserIdAndQuery: function(userId, query) {

			console.log("Get project list..");

			var deferred = Q.defer();

			if (!query) {
				query = {};
			}

			query.developers = {
				$elemMatch: {
					userId: userId
				}
			};

			try {

				Project.findOne(query, function(err, project) {
					if (err) {
						console.log("Error on Get project list..");
						deferred.reject(err);
					}
					console.log("Success on Get project list..");
					deferred.resolve(project);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},

		getProjectsByUserIdAndQuery: function(userId, query) {

			console.log("Get project list..");

			var deferred = Q.defer();

			if (!query) {
				query = {};
			}

			query.developers = {
				$elemMatch: {
					userId: userId
				}
			};

			try {

				Project.find(query, function(err, projects) {
					if (err) {
						console.log("Error on Get project list..");
						deferred.reject(err);
					}
					console.log("Success on Get project list..");
					deferred.resolve(projects);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},

		editProject: function(userId, id, name) {

			console.log("Edit project...");

			var deferred = Q.defer();

			try {
				var _self = this;

				_self.getProject(id).then(function(project) {
					if (!project) {
						console.log("Project not found for edit...");
						deferred.reject('Error : Cannot update project right now.');
					} else if (project) {

						Project.findOne({
							name: name
						}, function(err, projectSameName) {
							if (err) {
								deferred.reject('Error on edit project');
							}

							if (projectSameName) {
								console.log("Project names conflict for edit..");
								deferred.reject('You cannot have two apps with the same name.');

							} else {

								/***Start editing***/
								if (project && checkValidUser(project, userId, "Admin")) {
									project.name = name;

									project.save(function(err, project) {
										if (err) {
											console.log("Error on edit the project..");
											deferred.reject(err);
										}
										if (!project) {
											console.log("project not saved on edit..");
											deferred.reject('Cannot save the app right now.');
										} else {
											console.log("Successfull on edit project..");
											deferred.resolve(project._doc);
										}
									});
								} else {
									console.log("Unauthorized to edit the project..");
									deferred.reject("Unauthorized");
								}
								/***End Start editing***/
							}
						});
					}

				}, function(error) {
					console.log("error on retrieving project for edit..");
					deferred.reject(error);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},

		getProject: function(appId) {

			console.log("Get project...");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on Get project...");
						deferred.reject(err);
					} else {
						console.log("Successfull on get project..");
						deferred.resolve(project);
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

		},

		projectStatus: function(appId) {

			console.log("Get project status...");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on Get project status...");
						deferred.reject(err);
					} else {
						console.log("Successfull on get project status..");
						deferred.resolve(project);
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

		},
		activeApp: function(appId) {

			console.log("Getting project...");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on Getting project...");
						deferred.reject(err);
					}
					if (!project) {
						console.log("project Not found...");
						deferred.reject('project not found');
					} else {
						console.log("Successfull on getting project..");
						project.lastActive = Date.now();
						project.save(function(err, project) {
							if (err)
								return deferred.reject(err);
							if (!project)
								return deferred.reject('Unable to save after setting lastActive');
							else {
								return deferred.resolve(project.name);
							}

						});
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
		},
		notifyInactiveApps: function() {

			console.log("Inside notify Inactive apps api ...");

			var deferred = Q.defer();

			try {
				var inactiveApps = [];
				Project.find({
					deleted: false
				}, function(err, projects) {
					if (err) {
						console.log("Error in Getting projects...");
						deferred.reject(err);
					}
					if (!projects) {
						console.log("Error in Getting projects...");
						deferred.reject('error in getting projects');

					} else {
						var length = projects.length;
						if (length === 0)
							deferred.resolve(inactiveApps);
						projects.forEach(function(project, index) {
							length--;
							//60 days = 5184000000

							if (Date.now() - project._doc.lastActive > 5184000000) {
								inactiveApps.push(project._doc.appId);
								User.findById(project._doc._userId, function(err, user) {

									if (err)
										deferred.reject(err);
									else {
										var mailName = "inactiveApp";
										var emailTo = user._doc.email;
										var subject = "Your app " + project._doc.name + " is Inactive.";
										var appname = project._doc.name;
										var accountsURL = process.env["ACCOUNTS_URL"];
										if (!accountsURL)
											accountsURL = "http://localhost:1447";
										var variableArray = [{
											"domClass": "username",
											"content": user._doc.name,
											"contentType": "text"
										}, {
											"domClass": "appname",
											"content": appname,
											"contentType": "text"
										}, {
											"domClass": "link",
											"content": "<a href='" + accountsURL + "/reactivate/" + project._doc.appId + "' class='btn-primary'>Activate your account</a>",
											"contentType": "html"
										}];
										global.mailService.sendMail(mailName, emailTo, subject, variableArray).then(function(info) {
											if (length === 0)
												deferred.resolve(inactiveApps);
										}, function(err) {
											deferred.reject(err);
										});
									}
								});
							} else {
								if (length == 0)
									deferred.resolve(inactiveApps);

							}
						});
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
		},
		deleteInactiveApps: function(deleteReason) {
			console.log("Inside delete Inactive apps api ...");
			console.log('Authorized');
			var deferred = Q.defer();

			try {
				var inactiveApps = [];
				Project.find({
					deleted: false
				}, function(err, projects) {
					if (err) {
						console.log("Error in Getting projects...");
						deferred.reject(err);
					}
					if (!projects) {
						console.log("Error in Getting projects...");
						deferred.reject('error in getting projects');

					} else {
						var length = projects.length;
						if (length === 0)
							deferred.resolve([]);
						projects.forEach(function(project) {
							length--;
							//90 days = 7776000000
							if (Date.now() - project._doc.lastActive > 7776000000) {
								inactiveApps.push(project._doc.appId);
								User.findById(project._doc._userId, function(err, user) {
									if (err)
										deferred.reject(err);
									else {
										var mailName = "deleteApp";
										var emailTo = user._doc.email;
										var subject = "Your app " + project._doc.name + " is Deleted.";

										var variableArray = [{
											"domClass": "username",
											"content": user._doc.name,
											"contentType": "text"
										}, {
											"domClass": "appname",
											"content": project._doc.name,
											"contentType": "text"
										}];
										global.mailService.sendMail(mailName, emailTo, subject, variableArray).then(function(info) {
											utils._request('delete', global.keys.dataServiceUrl + '/app/' + project._doc.appId, {
												'secureKey': global.keys.secureKey,
												'deleteReason': deleteReason
											});
											if (length === 0)
												deferred.resolve(inactiveApps);
										}, function(err) {
											deferred.reject(err);
										});
									}
								});
							} else {
								if (length === 0)
									deferred.resolve(inactiveApps);
							}
						});

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
		},

		findOneAndUpdateProject: function(projectId, newJson) {

			console.log("Find and update project...");

			var deffered = Q.defer();

			try {

				Project.findOneAndUpdate({
					_id: projectId
				}, {
					$set: newJson
				}, {
					new: true
				}, function(err, project) {
					if (err) {
						console.log("Error on Find and update project...");
						return deffered.reject(err);
					}
					if (!project) {
						console.log("Project not found for ..Find and update project...");
						return deffered.reject(null);
					}
					if (project && project.planId) {
						_createPlanInAnalytics(project.appId, project.planId);
					}
					console.log("Success on Find and update project...");
					return deffered.resolve(project);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deffered.reject(err);
			}

			return deffered.promise;

		},
		updateProjectBy: function(query, newJson) {

			console.log("Find and update project...");

			var deffered = Q.defer();

			try {

				Project.findOneAndUpdate(query, {
					$set: newJson
				}, {
					new: true
				}, function(err, project) {
					if (err) {
						console.log("Error on Find and update project...");
						return deffered.reject(err);
					}
					if (!project) {
						console.log("Project not found for ..Find and update project...");
						return deffered.reject(null);
					}

					console.log("Success on Find and update project...");
					return deffered.resolve(project);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deffered.reject(err);
			}

			return deffered.promise;

		},
		updatePlanByAppId: function(appId, planId) {

			console.log("Update planId in project..");

			var deffered = Q.defer();

			try {

				Project.findOneAndUpdate({
					appId: appId
				}, {
					$set: {
						planId: planId
					}
				}, {
					new: true
				}, function(err, project) {
					if (err) {
						console.log("Error on update planId in project..");
						return deffered.reject(err);
					}
					if (!project) {
						console.log("Project not found.. on update planId in project..");
						return deffered.reject(null);
					}
					console.log("Successfull on update planId in project..");
					return deffered.resolve(project);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deffered.reject(err);
			}

			return deffered.promise;

		},

		deleteProjectBy: function(query) {

			console.log("Delete Project...");

			var deferred = Q.defer();

			try {

				console.log(' ++++++++ App Delete request +++++++++');

				Project.findOne(query, function(err, foundProj) {
					if (err) {
						console.log('++++++++ App Delete failed from frontend ++++++++++');
						deferred.reject(err);
					} else if (foundProj) {

						_deleteAppFromDS(foundProj.appId).then(function(resp) {
							console.log("Delete Project from data services......");
							deferred.resolve(resp);
						}, function(error) {
							console.log("Error on Delete Project from data services......");
							deferred.reject(error);
						});

					} else {
						console.log("Project not found ..Delete Project");
						deferred.reject("Project not found with specified user");
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

		},

		delete: function(appId, userId) {

			console.log("Delete Project...");

			var deferred = Q.defer();

			try {

				console.log(' ++++++++ App Delete request +++++++++');

				Project.findOne({
					appId: appId,
					developers: {
						$elemMatch: {
							userId: userId,
							role: "Admin"
						}
					}
				}, function(err, foundProj) {
					if (err) {
						console.log('++++++++ App Delete failed from frontend ++++++++++');
						deferred.reject(err);
					} else if (foundProj) {

						_deleteAppFromDS(appId).then(function(resp) {
							console.log("Delete Project from data services......");
							deferred.resolve(resp);
						}, function(error) {
							console.log("Error on Delete Project from data services......");
							deferred.reject(error);
						});

					} else {
						console.log("Project not found ..Delete Project");
						deferred.reject("Project not found with specified user");
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

		},

		/**
		 * This fucntion is used to deprovision an app from 3rd party cloud services like
		 * azure, amazon, heroku, etc.
		 *
		 */

		deleteAppAsAdmin: function(appId) {

			console.log("Delete Project...");

			var deferred = Q.defer();

			try {

				console.log(' ++++++++ App Delete request +++++++++');

				Project.findOne({
					appId: appId
				}, function(err, foundProj) {
					if (err) {
						console.log('++++++++ App Delete failed from frontend ++++++++++');
						deferred.reject(err);
					} else if (foundProj) {

						_deleteAppFromDS(appId).then(function(resp) {
							console.log("Delete Project from data services......");
							deferred.resolve(resp);
						}, function(error) {
							console.log("Error on Delete Project from data services......");
							deferred.reject(error);
						});

					} else {
						console.log("Project not found. ");
						deferred.reject("Project not found.");
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

		},

		allProjectList: function() {

			console.log("get all project list....");

			var deferred = Q.defer();

			try {

				Project.find({}, function(err, list) {
					if (err) {
						console.log("Error on get all project list....");
						deferred.reject(err);
					}
					console.log("Success on get all project list....");
					deferred.resolve(list);

				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},
		getProjectBy: function(query) {

			console.log("get all project list....");

			var deferred = Q.defer();

			try {

				Project.find(query, function(err, list) {
					if (err) {
						console.log("Error on get  project by query....");
						return deferred.reject(err);
					}
					if (!list || list.length == 0) {
						console.log("project not found to get project by Query..");
						return deferred.resolve(null);
					}

					console.log("Success on get project by query....");
					return deferred.resolve(list);

				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;
		},
		changeAppMasterKey: function(currentUserId, appId, value) {

			//if value is null. Key will automatically be generated.

			console.log("Change master key in project...");

			var deferred = Q.defer();

			try {
				var self = this;

				var authUser = {
					appId: appId,
					developers: {
						$elemMatch: {
							userId: currentUserId,
							role: "Admin"
						}
					}
				};

				self.getProjectBy(authUser).then(function(docs) {

					if (!docs || docs.length === 0) {
						console.log("Invalid User or project not found.");
						var invalidDeferred = Q.defer();
						invalidDeferred.reject("Invalid User or project not found.");
						return invalidDeferred.promise;
					}

					if (docs && docs.length > 0) {
						return _changeMasterKeyFromDS(appId, value);
					}

				}).then(function(resp) {
					deferred.resolve(resp);
				}, function(error) {
					deferred.reject(error);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;

		},
		changeAppClientKey: function(currentUserId, appId, value) {

			//if value is null. Key will automatically be generated.

			console.log("Change client key in project...");

			var deferred = Q.defer();

			try {
				var self = this;

				var authUser = {
					appId: appId,
					developers: {
						$elemMatch: {
							userId: currentUserId,
							role: "Admin"
						}
					}
				};

				self.getProjectBy(authUser).then(function(docs) {

					if (!docs || docs.length === 0) {
						console.log("Invalid User or project not found.");
						var invalidDeferred = Q.defer();
						invalidDeferred.reject("Invalid User or project not found.");
						return invalidDeferred.promise;
					}

					if (docs && docs.length > 0) {
						return _changeClientKeyFromDS(appId, value);
					}

				}).then(function(resp) {
					deferred.resolve(resp);
				}, function(error) {
					deferred.reject(error);
				});

			} catch (err) {
				global.winston.log('error', {
					"error": String(err),
					"stack": new Error().stack
				});
				deferred.reject(err);
			}

			return deferred.promise;

		},
		removeDeveloper: function(currentUserId, appId, userId) {

			console.log("Remove a developer from project..");

			var deferred = Q.defer();

			try {
				var self = this;

				Project.findOne({
					appId: appId,
					developers: {
						$elemMatch: {
							userId: userId
						}
					}
				}, function(err, foundProj) {
					if (err) {
						console.log("Error on finding aproject for to remove a developer..");
						deferred.reject(err);
					} else if (!foundProj) {
						console.log("project not found for to remove a developer..");
						deferred.reject("Project not found with given userId");
					} else if (currentUserId === userId || checkValidUser(foundProj, currentUserId, "Admin")) {
						//User can delete himself or can delete others when he is a Admin
						processRemoveDeveloper(foundProj, userId, currentUserId, self).then(function(data) {
							console.log("Success on remove a developer..");
							deferred.resolve(data);
						}, function(error) {
							console.log("Error on to remove a developer..");
							deferred.reject(error);
						});
					} else {
						console.log("Unauthorized user to remove a developer..");
						deferred.reject('Unauthorized!');
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

		},
		removeInvitee: function(currentUserId, appId, email) {

			console.log("Remove a invitee..");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId,
					invited: {
						$elemMatch: {
							email: email
						}
					}
				}, function(err, foundProj) {
					if (err) {
						console.log("Error on finding project for Remove a invitee..");
						deferred.reject(err);
					} else if (!foundProj) {
						console.log("project not found for Remove a invitee..");
						deferred.reject("Project not found with given Email");
					} else {

						global.userService.getAccountByEmail(email).then(function(foundUser) {

							if (checkValidUser(foundProj, currentUserId, "Admin") || foundUser._id === currentUserId) {
								//User can delete himself or can delete others when he is a Admin
								processRemoveInvitee(foundProj, email).then(function(data) {
									console.log("Successfull on Remove a invitee..");
									deferred.resolve(data);
								}, function(error) {
									console.log("Error on Remove a invitee..");
									deferred.reject(error);
								});

							} else {
								console.log("Unauthorized user to Remove a invitee..");
								deferred.reject("Unauthorized");
							}

						}, function(userError) {
							console.log("Error on getting user details for remove invitee..");
							deferred.reject("Cannot Perform this task now");
						});

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

		},

		inviteUser: function(appId, email) {

			console.log("Invite user to the app.");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on get project to Invite user to the app.");
						deferred.reject(err);
					}
					if (!project) {
						console.log("project not found to Invite user to the app.");
						deferred.reject("App not found!.");
					} else {

						global.userService.getAccountByEmail(email).then(function(foundUser) {
							if (foundUser) {

								if (!checkValidUser(project, foundUser._id, null)) {

									processInviteUser(project, email, foundUser).then(function(data) {
										console.log("Success on Invite user to the app.");
										deferred.resolve(data);
									}, function(error) {
										console.log("Error on Invite user to the app.");
										deferred.reject(error);
									});

								} else {
									console.log("Already a Developer to this App!");
									deferred.reject("Already a Developer to this App!");
								}

							} else { //There is no user with this email in cloudboost
								processInviteUser(project, email, foundUser).then(function(data) {
									console.log("Success on Invite user to the app.");
									deferred.resolve(data);
								}, function(error) {
									console.log("Error on Invite user to the app.");
									deferred.reject(error);
								});
							}
						}, function(usererror) {
							console.log("Error on getting user details to Invite user to the app.");
							deferred.reject(usererror);
						});

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

		},
		addDeveloper: function(currentUserId, appId, email) {

			console.log("Add developer...");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on get project to Add developer...");
						deferred.reject(err);
					}
					if (!project) {
						console.log("project not found to Add developer...");
						deferred.reject("App not found!.");
					} else {

						if (!checkValidUser(project, currentUserId, null)) {

							//Adding developer
							var newDeveloper = {};
							newDeveloper.userId = currentUserId;
							newDeveloper.role = "User";

							project.developers.push(newDeveloper);
							//End Adding developer

							var notificationId = null;
							if (project.invited && project.invited.length > 0) {
								for (var i = 0; i < project.invited.length; ++i) {
									if (project.invited[i].email === email) {
										notificationId = project.invited[i].notificationId;
										project.invited.splice(i, 1);
									}
								}
							}

							project.save(function(err, savedProject) {
								if (err) {
									console.log("Error on adding developer..");
									deferred.reject(err);
								}
								if (!savedProject) {
									console.log("Cannot save the project to add developer");
									deferred.reject('Cannot save the app right now.');
								} else {
									console.log("Successfull to add developer");
									deferred.resolve(savedProject);
									if (notificationId) {
										global.notificationService.removeNotificationById(notificationId);
									}
								}
							});

						} else {
							console.log("Already a developer to this app..");
							deferred.resolve("Already added!");
						}

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

		},

		changeDeveloperRole: function(currentUserId, appId, requestedUserId, newRole) {

			console.log("Change  developer role...");

			var deferred = Q.defer();

			try {

				Project.findOne({
					appId: appId
				}, function(err, project) {
					if (err) {
						console.log("Error on get project changing developer role...");
						deferred.reject(err);
					}
					if (!project) {
						console.log("project not found changing developer role...");
						deferred.reject("App not found!.");
					} else {

						if (checkValidUser(project, currentUserId, "Admin")) {

							var tempDeveloperArray = [].concat(project.developers || []);
							for (var i = 0; i < tempDeveloperArray.length; ++i) {
								if (tempDeveloperArray[i].userId === requestedUserId) {
									tempDeveloperArray[i].role = newRole;
									break;
								}
							}

							//Check atleast one admin will be there
							var atleastOneAdmin = _.find(tempDeveloperArray, function(eachObj) {
								if (eachObj.role === "Admin") {
									return true;
								}
							});

							if (atleastOneAdmin) {

								project.developers = tempDeveloperArray;
								project.markModified('developers');

								project.save(function(err, savedProject) {
									if (err) {
										console.log("Error on changing developer role..");
										deferred.reject(err);
									}
									if (!savedProject) {
										console.log("Cannot save the project for change developer role");
										deferred.reject('Cannot save the project for change developer role.');
									} else {
										console.log("Successfull for changing devloper role");
										deferred.resolve(savedProject);
									}
								});

							} else {
								deferred.reject('Atleast one admin should be there for an app.');
							}

						} else {
							console.log("Only Admin can change role..");
							deferred.resolve("Only Admin can change role!");
						}

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
	};

};

function generateNonExistingAppId() {

	console.log("Function for generate nonExistAppId...");

	var deferred = Q.defer();

	try {
		var appId = randomString({
			length: 12,
			numeric: false,
			letters: true,
			special: false
		});
		appId = appId.toLowerCase();

		global.projectService.getProject(appId).then(function(existedProject) {
			if (!existedProject) {
				deferred.resolve(appId);
			} else if (existedProject) {
				return generateNonExistingAppId();
			}
		}).then(function(nonExistAppId) {
			console.log("Success on generateNonExistingAppId");
			deferred.resolve(nonExistAppId);
		}, function(error) {
			console.log("Error on Get project to generateNonExistingAppId");
			deferred.reject(error);
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

function processRemoveDeveloper(foundProj, userId, currentUserId, self) {

	console.log("Private function for process remove developer...");

	var deferred = Q.defer();

	try {
		var tempArray = foundProj.developers;

		for (var i = 0; i < foundProj.developers.length; ++i) {
			if (foundProj.developers[i].userId === userId) {
				tempArray.splice(i, 1);
			}
		}

		//Find Atleast one admin
		var atleastOneAdmin = _.find(foundProj.developers, function(eachObj) {
			if (eachObj.role === "Admin") {
				return true;
			}
		});

		if (tempArray.length > 0 && atleastOneAdmin) {
			foundProj.developers = tempArray;
			foundProj.save(function(err, project) {
				if (err) {
					console.log("Error on Private function for process remove developer...");
					deferred.reject(err);
				}
				if (!project) {
					console.log("Project not found for Private function for process remove developer...");
					deferred.reject('Cannot save the app right now.');
				} else {
					console.log("Successfull on Private function for process remove developer...");
					deferred.resolve(project);
				}
			});

		} else {
			self.delete(foundProj.appId, currentUserId).then(function(resp) {
				console.log("Successfull on Delete project Private function to remove developer..");
				deferred.resolve(resp);
			}, function(error) {
				console.log("Error on Delete project Private function to remove developer..");
				deferred.reject(error);
			});
		}

	} catch (err) {
		global.winston.log('error', {
			"error": String(err),
			"stack": new Error().stack
		});
		deferred.reject(err);
	}

	return deferred.promise;
}

function processRemoveInvitee(foundProj, email) {

	console.log("private function for Process remove invitee..");

	var deferred = Q.defer();

	try {
		var tempArray = foundProj.invited;
		var notificationId = null;

		if (tempArray && tempArray.length > 0) {
			for (var i = 0; i < tempArray.length; ++i) {
				if (tempArray[i].email === email) {
					notificationId = tempArray[i].notificationId;
					tempArray.splice(i, 1);
				}
			}
		}

		foundProj.invited = tempArray;
		foundProj.save(function(err, project) {
			if (err) {
				console.log("Error on save project in private function for Process remove invitee..");
				deferred.reject(err);
			}
			if (!project) {
				console.log("project not found in private function for Process remove invitee..");
				deferred.reject('Cannot save the app right now.');
			} else {
				console.log("Successfull for private function for Process remove invitee..");
				deferred.resolve(project);
				if (notificationId) {
					global.notificationService.removeNotificationById(notificationId);
				}
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

function processInviteUser(project, email, foundUser) {

	console.log("Private function for Process Invite User");

	var deferred = Q.defer();

	try {
		var alreadyInvited = _.first(_.where(project.invited, {
			email: email
		}));

		//Invitation
		if (!alreadyInvited) {

			var notificationType = "confirm";
			var type = "invited-project";
			var text = "You have been invited to collaborate on <span style='font-weight:bold;'>" + project.name + "</span>. Do you want to accept the invite?";

			var userIdOREmail = null;
			if (foundUser && foundUser._id) {
				userIdOREmail = foundUser._id;
			} else {
				userIdOREmail = email;
			}

			global.notificationService.createNotification(project.appId, userIdOREmail, notificationType, type, text).then(function(notificationId) {

				var inviteeObj = {
					email: email,
					notificationId: notificationId._id
				};

				project.invited.push(inviteeObj);

				project.save(function(err, savedProject) {
					if (err) {
						console.log("Error on save project in Private function for Process Invite User");
						deferred.reject(err);
					}
					if (!savedProject) {
						console.log("project not found in Private function for Process Invite User");
						deferred.reject('Cannot save the app right now.');
					} else {
						console.log("Successfull on Private function for Process Invite User");
						deferred.resolve("successfully Invited!");
						//global.mandrillService.inviteDeveloper(email,savedProject.name);

						var mailName = "invitedeveloper";
						var emailTo = email;
						var subject = "You're invited to collaborate";

						var variableArray = [{
							"domClass": "projectname",
							"content": savedProject.name,
							"contentType": "text"
						}];

						global.mailService.sendMail(mailName, emailTo, subject, variableArray);
					}
				});

			}, function(error) {
				console.log("Error on create notification in Private function for Process Invite User");
				deferred.reject(error);
			});

		} else {
			deferred.reject("Already Invited!");
		}

	} catch (err) {
		global.winston.log('error', {
			"error": String(err),
			"stack": new Error().stack
		});
		deferred.reject(err);
	}

	return deferred.promise;
}

function checkValidUser(app, userId, role) {

	try {
		if (app.developers && app.developers.length > 0) {
			return _.find(app.developers, function(eachObj) {
				if (eachObj.userId === userId) {

					if (role && eachObj.role === role) {
						return true;
					} else if (role && eachObj.role !== role) {
						return false;
					} else if (!role) {
						return true;
					}

				}
			});
		} else {
			return false;
		}

	} catch (err) {
		global.winston.log('error', {
			"error": String(err),
			"stack": new Error().stack
		});
	}
}

/***********************Pinging Data Services*********************************/

function _createAppFromDS(appId) {

	console.log("Create app From Data services...");

	var deferred = Q.defer();

	try {
		var post_data = {};
		post_data.secureKey = global.keys.secureKey;
		post_data = JSON.stringify(post_data);

		var url = global.keys.dataServiceUrl + '/app/' + appId;
		request.post(url, {
			headers: {
				'content-type': 'application/json',
				'content-length': post_data.length
			},
			body: post_data
		}, function(err, response, body) {
			if (err || response.statusCode === 500 || body === 'Error' || response.statusCode === 401) {
				console.log("Error on Create app From Data services...");
				console.log(err);
				deferred.reject(err);
			} else {
				console.log("Successfull on create app from data services..");
				try {
					deferred.resolve(body);
				} catch (e) {
					deferred.reject(e);
				}
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

function _deleteAppFromDS(appId) {

	console.log("Delete app from data services..");

	var deferred = Q.defer();

	try {
		var post_data = {};
		post_data.secureKey = global.keys.secureKey;
		post_data = JSON.stringify(post_data);

		request.del({
			headers: {
				'content-type': 'application/json',
				'content-length': post_data.length
			},
			url: keys.dataServiceUrl + "/app/" + appId,
			body: post_data
		}, function(error, response, body) {
			if (response) {
				try {
					var respData = JSON.parse(response.body);
					if (respData.status === 'Success') {
						console.log('successfully Delete app from data services.');
						deferred.resolve('Successfully deleted');
					} else {
						console.log('unable Delete app from data services.');
						deferred.reject("Unable to delete!");
					}
				} catch (e) {
					deferred.reject(e);
				}

			} else {
				console.log('unable Delete app from data services.');
				deferred.reject("Unable to delete!");
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

function _changeClientKeyFromDS(appId, value) {

	console.log("Change ClientKey From Data services...");

	var deferred = Q.defer();

	try {
		var post_data = {};
		post_data.secureKey = global.keys.secureKey;
		post_data.value = value;
		post_data = JSON.stringify(post_data);

		var url = global.keys.dataServiceUrl + '/admin/' + appId + '/clientkey';
		request.put(url, {
			headers: {
				'content-type': 'application/json',
				'content-length': post_data.length
			},
			body: post_data
		}, function(err, response, body) {
			if (err || response.statusCode === 500 || body === 'Error') {
				console.log("Error on Change ClientKey From Data services...");
				console.log(err);
				deferred.reject(err);
			} else {
				console.log("Successfull on Change ClientKey from data services..");
				try {
					var respBody = JSON.parse(body);
					deferred.resolve(respBody);
				} catch (e) {
					deferred.resolve(body);
				}
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

function _changeMasterKeyFromDS(appId, value) {

	console.log("Change MasterKey From Data services...");

	var deferred = Q.defer();

	try {
		var post_data = {};
		post_data.secureKey = global.keys.secureKey;
		post_data.value = value;
		post_data = JSON.stringify(post_data);

		var url = global.keys.dataServiceUrl + '/admin/' + appId + '/masterkey';
		request.put(url, {
			headers: {
				'content-type': 'application/json',
				'content-length': post_data.length
			},
			body: post_data
		}, function(err, response, body) {
			if (err || response.statusCode === 500 || body === 'Error') {
				console.log("Error on Change masterkey From Data services...");
				console.log(err);
				deferred.reject(err);
			} else {
				console.log("Successfull on Change masterkey from data services..");
				try {
					var respBody = JSON.parse(body);
					deferred.resolve(respBody);
				} catch (e) {
					deferred.resolve(body);
				}
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

function _createPlanInAnalytics(appId, planId) {

	console.log("Create Plan in analyticsServices..");

	var deferred = Q.defer();

	try {
		var post_data = {};
		post_data.secureKey = global.keys.secureKey;
		post_data.planId = planId;
		post_data = JSON.stringify(post_data);

		var url = global.keys.analyticsServiceUrl + '/plan/' + appId;

		request.post(url, {
			headers: {
				'content-type': 'application/json',
				'content-length': post_data.length
			},
			body: post_data

		}, function(err, response, body) {

			if (err || response.statusCode === 500 || response.statusCode === 400 || body === 'Error') {
				console.log("Error on  Create Plan in analyticsServices..");
				deferred.reject(err);
			} else {
				console.log("Success on Create Plan in analyticsServices..");

				try {
					var respBody = JSON.parse(body);
					deferred.resolve(respBody);
				} catch (e) {
					deferred.reject(e);
				}
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
