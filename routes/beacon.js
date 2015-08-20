var express = require('express');
var app = express();

module.exports = function(beaconService) {

    //routes
    app.get('/beacon/get', function(req,res,next) {
	
        var currentUserId= req.session.passport.user ? req.session.passport.user.id : req.session.passport.user;
                        
		beaconService.getBeaconByUserId(currentUserId).then(function(beaconObj) {		
            return res.json(200, beaconObj);
        },function(error){
            return res.send(500, error);
        });    
    });

    app.post('/beacon/update', function(req,res,next) {

        var data = req.body || {};
        var currentUserId= req.session.passport.user ? req.session.passport.user.id : req.session.passport.user;
       
        if(currentUserId && data){
        	if(currentUserId==data._userId){
        		beaconService.updateBeacon(currentUserId,data).then(function(beaconObj) {
	              if (!beaconObj) {
	                return res.send(400, 'Error : Beacon not found');
	              }
	              return res.json(200, beaconObj);

	            },function(error){
	              return res.send(400, error);
	            });
        	}else{
        		return res.send(400, "Unauthorized");
        	}
        }else{
            return res.send(401);
        }

    });

    return app;

}