var express = require('express')        // For responding to webhooks
var request = require('request')        // For sending requests
var bodyParser = require('body-parser') // Parsing JSON
require('array.prototype.find')         // To find tasks in arrays

var app = express()
app.use(bodyParser.json())

// Make requests to the Teamwork.com API
function teamworkRequest(uri, method, data, callback) {
  callback = callback || function() {}
  return request({
    'method': method,
    'uri': 'https://lisalab.teamwork.com' + uri,
    'auth': {
      'user': '',  // API key
      'pass': 'X', // Random value
      'sendImmediately': false
    },
    'json': true,
    'body': data
  }, callback)
}

// Just for debugging; prints bad HTTP responses
function checkSuccess(error, response, body) {
  if (!error && (response.statusCode == 201 || response.statusCode == 200)) {
    console.log('Successfull call to Teamwork.com')
  } else {
    console.log('Failed call to Teamwork.com: ' + JSON.stringify(body))
  }
}

app.post('/', function (req, res) {
  // Figure out whether it is Pylearn2 or Theano
  var prefix = req.body['repository']['name'].substr(0, 2).toUpperCase()
  var taskList
  if (prefix == 'PY') {
    taskList = 391086
  } else if (prefix == 'TH') {
    taskList = 391468
  } else {
    console.log('Received request from unknown repository:' +
                req.body['repository']['name'])
  }
  if (req.headers['x-github-event'] == 'issues') {
    if (req.body['issue']['labels'].some(function(label) {
      return label['name'] === 'CCW'
    })) {
      // TASK 1: Add the issue as a task
      if (req.body['action'] === 'labeled' &&
          req.body['issue']['state'] === 'open') {
        console.log('Adding issue #' + req.body['issue']['number'])
        // Check whether the task exists on Teamwork.com already
        teamworkRequest('/tasks.json', 'GET', {
            'includeCompletedTasks': true
          }, function(error, response, body) {
          checkSuccess(error, response, body)
          if (!body['todo-items'].some(function(todo) {
            return todo['content'].indexOf(
              prefix + '-' + req.body['issue']['number'] + ' ') === 1 
          })) {
            // Add the task to Teamwork.com
            teamworkRequest('/tasklists/' + taskList + '/tasks.json', 'POST', {
              'todo-item': {
                'content': '#' + prefix  + '-' + req.body['issue']['number'] +
                           ' ' + req.body['issue']['title'],
                'description': req.body['issue']['html_url']
              }
            }, checkSuccess)
          }
        })
      } else if (req.body['action'] === 'closed') {
        // TASK 2: Close the task on teamwork.com
        console.log('Closing issue #' + req.body['issue']['number'])
        teamworkRequest('/tasks.json', 'GET', undefined,
                        function(error, response, body) {
          checkSuccess(error, response, body)
          task = body['todo-items'].find(function(todo) {
            return todo['content'].indexOf(
              prefix + '-' + req.body['issue']['number'] + ' ') === 1 
          })
          if (task !== undefined) {
            teamworkRequest('/tasks/' + task['id'] + '/complete.json', 'PUT',
                            undefined, checkSuccess)
          }
        })
      } 
    }
  } else if (req.headers['x-github-event'] === 'issue_comment') {
    if (req.body['issue']['labels'].some(function(label) {
      return label['name'] === 'CCW'
    }) && req.body['comment']['body'].toLowerCase().indexOf('/ccw') > -1) {
      // TASK 3: Make comments
      console.log("Making comment on issue #" + req.body['issue']['number'])
      teamworkRequest('/tasks.json', 'GET', {
          'includeCompletedTasks': true
        }, function(error, response, body) {
        checkSuccess(error, response, body)
        task = body['todo-items'].find(function(todo) {
          return todo['content'].indexOf(
            prefix + ' - ' + req.body['issue']['number'] + ' ') === 1 
        })
        if (task !== undefined) {
          teamworkRequest('/tasks/' + task['id'] + '/comments.json', 'POST', {
            'comment': {
              'body': '@' + req.body['comment']['user']['login'] + ': ' +
                      req.body['comment']['body'] + "\n\n" +
                      req.body['comment']['html_url'],
            }
          }, checkSuccess)
        }
      })
    }
  } else {
    console.log('Not handling event: ' + req.body['action'])
  }
  res.send(req.body)
})

var server = app.listen(3000, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)
})
