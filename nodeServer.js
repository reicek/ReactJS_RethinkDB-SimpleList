/**
 * nodeServer.js - NodeJS Restful API for RethinkDB
 * 2015, by Cesar Anton Dorantes @reicek
 * for https://platzi.com/
 * This work is licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. 
 * To view a copy of this license, visit http://creativecommons.org/licenses/by-sa/4.0/.
 **/

// ******************************************
//		Import configurations
// ******************************************

var config				= require('./config.json');

// ******************************************
//		Install NodeJS Dependencies
// ******************************************

// Serve-Static 
var serveStatic			= require('serve-static');
// Body-Parser
var bodyParser			= require('body-parser');
// Multer
var multer				= require('multer')
// RethinkDB
var r					= require('rethinkdb');
// Express
var express				= require('express');
var app					= express();
// Socket Server
var server				= require('http').Server(app);
// Socket.IO
var io					= require('socket.io')(server);
// ******************************************
//		Initialize
// ******************************************

var table				= 'list';
var tableIndex			= 'createdAt';

var startServer		= function() {
    server.listen(config.express.port);
	console.log('_____________________');
	console.log('HTTP service online');
	console.log('Web Socket service online');
	console.log('API service online');
    console.log('Listening on port '+config.express.port);
	console.log('_____________________');
}

var initializeRTDB		= function(conn) {
	r.table(table).indexWait('createdAt').run(conn)
		.then(function(result) {
			console.log("DB OK, starting express...");
			console.log('_____________________');
			startServer();
		})
		.error(function(error){
			console.log("The table doesn't exist.");
			console.log("Initializing table: "+table);
			r.tableCreate(table).run(conn)
				.finally(function(){
					console.log("Initializing index: "+tableIndex);
					r.table(table).indexCreate(tableIndex).run(conn)
						.finally(function(){
							console.log("DB Initialized, starting express...");
							console.log('_____________________');
							startServer();
						});
				});
		});	
};

r.connect(config.rethinkdb)
	.then(function(conn) {
		console.log('_____________________');
		console.log("Connected to RethinkDB");
		console.log("Checking DB...");
		r.dbList().run(conn)
			.then(function(dbList){
				if (dbList.indexOf(config.rethinkdb.db) > -1)
				{
					initializeRTDB(conn);
				} else {
					console.log("The DB doesn't exist.");
					console.log("Initializing DB "+config.rethinkdb.db);
					r.dbCreate(config.rethinkdb.db).run(conn)
						.then(initializeRTDB(conn))
				}
			})
	})
	.error(function(error){
		console.log("Could not open a connection to initialize the database "+config.rethinkdb.db);
		console.log(error.message);
		process.exit(1);
	});

// ******************************************
//		API
// ******************************************

// ------------------------------------------
//		Send back a 500 error
// ------------------------------------------

var handleError			= function(res) {
    return function(error){
		res.send(500,{error: error.message});
	}
}


// ------------------------------------------
//		List all elements
// ------------------------------------------

var list				= function(request, res, next) {
	console.log('_____________________');
	console.log('API - list/list');
	
	r.connect(config.rethinkdb)
		.then(function(conn) {
			r.table(table).orderBy({index: "createdAt"}).run(conn)
				.then( function(data) {
					var query = data._responses[0].r;
					res.send(query);
					console.log('Data sent.');
					console.log('_____________________');
				})
				.error(handleError(res))
		});
}

// ------------------------------------------
//		Insert an element
// ------------------------------------------

var add					= function(request, res, next) {
	var element			= request.body;
	console.log('_____________________');
	console.log('API - list/add');
	console.log(element);
	element.createdAt	= r.now();
	
	r.connect(config.rethinkdb)
		.then(function(conn) {
			r.table(table).insert(element).run(conn)
				.then( function() {
					console.log('New data added.');
					console.log('_____________________');
				})
				.error(handleError(res))
		});
}

// ------------------------------------------
//		Delete all elements
// ------------------------------------------

var	empty				= function (request, res, next) {
	console.log('_____________________');
	console.log('API - list/empty');
	
	r.connect(config.rethinkdb)
		.then(function(conn) {
			r.table(table).delete({returnChanges: true}).run(conn)
				.then( function(changes) {
					console.log(changes);
					console.log('All data erased.');
					console.log('_____________________');
				})
				.error(handleError(res))
		});
}

// ******************************************
//		Express Setup
// ******************************************

// Data parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multer());
// Define main routes
app.route('/api/list').get(list);
app.route('/api/add').put(add);
app.route('/api/empty').post(empty);
// Static files server
app.use(serveStatic('./public'));


io.on('connection', function (socket) {
	this.socket		= socket;
	var webSocket	= this.socket;
	webSocket.emit('test', { result: 'Web Socket OK' }); // Sisten to test conection
	r.connect(config.rethinkdb)
		.then(function(conn) {
			r.table(table).changes().run(conn, function(error,feed){
				feed.on("data",function(change){
					webSocket.emit('change',{change:change});
				});
				feed.on("error",function(error){
					webSocket.emit('error',{error:error});
				});
			});
		});
});