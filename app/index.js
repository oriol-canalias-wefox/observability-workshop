var express = require('express');
var promClient = require('prom-client');
const register = promClient.register;

var app = express();

const requestCounter = new promClient.Counter({
	name: 'total_requests',
	help: 'Requests counter',
	labelNames: ['statusCode']
});

const loggedUsers = new promClient.Gauge({
	name: 'logged_users_total',
	help: 'Total number of logged users'
});

const responseTime = new promClient.Histogram({
	name: 'request_duration_seconds',
	help: 'API response time'
});

var resetLoggedUsers = false;

function randn_bm(min, max, skew) {
	var u = 0, v = 0;
	while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
	while (v === 0) v = Math.random();
	let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

	num = num / 10.0 + 0.5; // Translate to 0 -> 1
	if (num > 1 || num < 0) num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
	num = Math.pow(num, skew); // Skew
	num *= max - min; // Stretch to fill range
	num += min; // offset to min
	return num;
}

setInterval(() => {
	// Increase request counter
	var errorTax = 	5;
	var statusCode = (Math.random() < errorTax/100) ? '500' : '200';
	requestCounter.labels(statusCode).inc();

	// Update logged users guage
	var loggedUsersToUpdate = (resetLoggedUsers) ? 0 : 500 + Math.round((50 * Math.random()))
	loggedUsers.set(loggedUsersToUpdate);

	// Observation response time
	var observedTime = randn_bm(0, 3, 4);
	responseTime.observe(observedTime);
}, 150);

app.get('/', function (req, res) {
	res.send('Hello World!');
});

app.get('/zera-usuarios-logados', function (req, res) {
	resetLoggedUsers = true;
	res.send('OK');
});

app.get('/retorna-usuarios-logados', function (req, res) {
	resetLoggedUsers = false;
	res.send('OK');
});

app.get('/metrics', function(req, res) {
	res.set('Content-Type', register.contentType);
	res.end(register.metrics());
})

app.listen(3010);