var rest = require('restler');
var oauth = require('./oauth.js');

function request(options) {
	// TODO - API version
	var restUrl = options.oauth.instance_url + '/services/data' + options.path;
	//console.log("rest.request - method: " + options.method + " restUrl: " + restUrl + ", data: " + options.data);
	
	rest.request(restUrl, {
	    method: options.method,
	    data: options.data,
	    headers: {
	        'Accept':'application/json',
	        'Authorization':'OAuth ' + options.oauth.access_token,
	        'Content-Type': 'application/json',
	    }
    }).on('complete', function(data, response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
			//console.log("REST Response: " + data);
			if (data.length == 0) {
				options.callback();
			} else {
				options.callback(JSON.parse(data));
			}
        }
    }).on('error', function(data, response) {
		  console.error(data);
		  if (response.statusCode == 401) {
		      // Session expired or invalid
		      if ( options.retry || ! options.refresh ) {
		          console.log("Invalid session - we tried!");
		          // We already tried, or there is no refresh callback
		          options.error(data, response);
		      } else {
		          // We use a refresh callback from options to decouple
		          // rest from oauth
		          console.log("Invalid session - trying a refresh");
		          options.refresh(function(oauth){
		              options.oauth.access_token = oauth.access_token;
        		      options.retry = true;
        		      request(options);		              
		          });
		      }
		  } else {
		      options.error(data, response);
		  }
	});
}

function makeAPI(options) {
    var apiVersion = options.apiVersion || '22.0';
    var oauth = options.oauth;
    var refresh = options.refresh;
    
    return {
        versions: function versions(callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/',
        		callback: callback,
        		error: error
        	}
        	request(options);
        },

        resources: function resources(callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        describeGlobal: function describeGlobal(callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        metadata: function metadata(objtype, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        describe: function describe(objtype, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/describe/',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        create: function create(objtype, fields, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/',
        		callback: callback,
        		error: error,
        		method: 'POST',
        		data: JSON.stringify(fields)
        	}
        	request(options);
        },
        
        retrieve: function retrieve(objtype, id, fields, callback, error) {
            if (typeof fields === 'function') {
                // fields param missing
                error = callback;
                callback = fields;
                fields = null;
            }
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/' + id
                    + (fields ? '?fields=' + fields : ''),
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        upsert: function upsert(objtype, externalIdField, externalId, fields, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/' + externalIdField + '/' + externalId,
        		callback: callback,
        		error: error,
        		method: 'PATCH',
        		data: JSON.stringify(fields)
        	}
        	request(options);
        },
        
        update: function update(objtype, id, fields, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/' + id,
        		callback: callback,
        		error: error,
        		method: 'PATCH',
        		data: JSON.stringify(fields)
        	}
        	request(options);
        },
        
        del: function del(objtype, id, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/sobjects/' + objtype + '/' + id,
        		callback: callback,
        		error: error,
        		method: 'DELETE',
        	}
        	request(options);
        },
        
        search: function search(sosl, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/search/?q=' + escape(sosl),
        		callback: callback,
        		error: error
        	}
        	request(options);
        },
        
        query: function query(soql, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/query/?q=' + escape(soql),
        		callback: callback,
        		error: error
        	}
        	request(options);
        },
        
        recordFeed: function recordFeed(id, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/chatter/feeds/record/' + id + '/feed-items',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        newsFeed: function newsFeed(id, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/chatter/feeds/news/' + id + '/feed-items',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        },
        
        profileFeed: function profileFeed(id, callback, error) {
        	var options = {
        	    oauth: oauth,
        		refresh: refresh,
        		path: '/v' + apiVersion + '/chatter/feeds/user-profile/' + id + '/feed-items',
        		callback: callback,
        		error: error,
        	}
        	request(options);
        }        
    };
};

// token can be an oauth object (with access_token etc properties), an object
// with an oauth property, or a string containing an access token
exports.api = function api(token, refresh) {
    var oauthObj;
    
    oauthObj = (token.access_token) ? 
        token : 
        (token.oauth || { access_token: token });
    
    return makeAPI({
        oauth: oauthObj,
        refresh: refresh || function(callback) {
            oauth.refresh({
                oauth: oauthObj,
                callback: callback
            });            
        }
    });
}

