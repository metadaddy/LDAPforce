var ldap = require('ldapjs'),
    oauth = require('./oauth'),
    rest = require('./rest');

var server = ldap.createServer();
var SUFFIX = 'dc=salesforce, dc=com';
var userFields = null;

var inetorgpersonToUser = {
    cn: 'name',
    departmentnumber: 'department',
    displayname: 'name',
    employeenumber: 'employeenumber',
    facsimiletelephonenumber: 'fax',
    givenname: 'firstname',
    mail: 'email',
    mobile: 'mobilephone',
    postalcode: 'postalcode',
    preferredlanguage: 'localesidkey',
    sn: 'lastname',
    telephonenumber: 'phone',
    title: 'title',
    uid: 'id'
};

var userToInetorgperson = {};
for (var key in inetorgpersonToUser) {
    value = inetorgpersonToUser[key];
    if (userToInetorgperson[value]) {
        userToInetorgperson[value].push(key);
    } else {        
        userToInetorgperson[value] = [key];
    }
}

var inetorgpersonToContact = {
    cn: 'name',
    departmentnumber: 'department',
    description: 'description',
    displayname: 'name',
    facsimiletelephonenumber: 'fax',
    givenname: 'firstname',
    homephone: 'homephone', 
    mail: 'email',
    mobile: 'mobilephone',
    telephonenumber: 'phone',
    title: 'title',
    sn: 'lastname',
    uid: 'id'
};

var contactToInetorgperson = {};
for (var key in inetorgpersonToContact) {
    value = inetorgpersonToContact[key];
    if (contactToInetorgperson[value]) {
        contactToInetorgperson[value].push(key);
    } else {        
        contactToInetorgperson[value] = [key];
    }
}

function makeFieldList(attributes) {
    // Need Username for dn
    var fieldList  = ['id', 'username'];
    for (var i in attributes) {
        // map inetOrgPerson attributes to User fields
        var attribute = inetorgpersonToUser[attributes[i]] || 
            attributes[i];
        // filter out unknown fields
        if (userFields.indexOf(attribute) != -1) {
            // filter out dupes
            if ( fieldList.indexOf(attribute) == -1) {
                fieldList.push(attribute);                
            }
        }
    }
    return fieldList;
}

function doQuery(req, res, next, whereClause) {
    var objectType = 'User'; // just for now
    
    var fieldList = (req.attributes.length == 0) ? 
        userFields : makeFieldList(req.attributes);

    var fields = '';
    for (var i in fieldList) {
        fields += ((i != 0) ? ',' : '') + fieldList[i];
    }
    
    var query = 'SELECT ' + fields + ' FROM ' + objectType + whereClause;
    
    console.log('query is '+query);
    
    req.connection.api.query(query, function(data) {
		for (var i in data.records) {
			var obj = {
                dn: 'username='+data.records[i].Username+', ou=Users, '+SUFFIX,
                attributes: {
                    objectclass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson', 'salesforceUser'],
                }
            }
            for (key in data.records[i]) {
                if (typeof key === 'string' && key !== 'attributes' && data.records[i][key]) {
                    // Seems like attribute name has to be lower case for
                    // ldapjs to handle them for us
                    var attribute = key.toLowerCase();
                    var value = data.records[i][key].toString();
                    
                    obj.attributes[attribute] = value;
                    
                    for (var j in userToInetorgperson[attribute]) {
                        obj.attributes[userToInetorgperson[attribute][j]] = value;
                    }
                }
            }
			res.send(obj);
		};
		res.end();
	}, function () {
        // TODO - Figure out the correct error
        return next(new ldap.OperationsError());
	});    
}

function filterToString(filter) {
    var str;
    
    var attribute = inetorgpersonToUser[filter.attribute] || filter.attribute;
        
    switch (filter.type) {
    case 'approx':
    case 'equal':
        str = attribute + '=\'' + filter.value + '\'';
        break;
    case 'present':
        if (attribute === 'objectclass') {
            str = '';
        } else {
            str = attribute + '!=null';            
        }
        break;
    case 'substring':
        str = attribute + ' LIKE \''
        str += filter.initial || '';
        str += '%';
        for ( var i in filter.any) {
            str += filter.any[i]+'%';            
        }
        str += filter.final || '';
        str += '\'';  
        break;
    case 'ge':
        str = attribute + '>=\'' + filter.value + '\'';
        break;
    case 'le':
        str = attribute + '<=\'' + filter.value + '\'';
        break;
    case 'and':
        str = '';
        for ( var i in filter.filters ) {
            str += ((i != 0) ? 'AND' : '') + '(' + filterToString(filter.filters[i]) + ')';
        }
        break;
    case 'or':
        str = '';
        for ( var i in filter.filters ) {
            str += ((i != 0) ? 'OR' : '') + '(' + filterToString(filter.filters[i]) + ')';
        }
        break;
    case 'not':
        str = 'NOT(' + filterToString(filter.filter) + ')';
        break;
    }
    
    return str;
}

// TODO - search in User/Contact depending on ou
server.search(SUFFIX,
function(req, res, next) {
    console.log('attributes: ' + JSON.stringify(req.attributes, null, '    '))
    console.log('base object: ' + JSON.stringify(req.dn, null, '    '));
    console.log('scope: ' + req.scope);
    console.log('filter: ' + JSON.stringify(req.filter, null, '    '));
    
    var whereClause = filterToString(req.filter);
    
    if (whereClause) {
        whereClause = ' WHERE ' + whereClause;
    }

    // Need to load userFields before we can do the query
    if ( userFields ) {
        return doQuery(req, res, next, whereClause);
    } else {
        req.connection.api.describe('User', function(data) {
            userFields = [];
            for ( var i in data.fields ) {
                // Attribute names are normalized to lower case in ldapjs
                userFields.push(data.fields[i].name.toLowerCase());
            }
            return doQuery(req, res, next, whereClause);
        }, function () {
            // TODO - Figure out the correct error
            return next(new ldap.OperationsError());
        });
    }
});

server.bind(SUFFIX,
function(req, res, next) {
    var username = req.dn.rdns[0].username;
    var password = req.credentials;
    var options = {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        loginServer: process.env.LOGIN_SERVER
    };
    
    console.log('BIND - trying login with username ' + username)
    oauth.login(username, password, options,
    function(oauth) {
        console.log("BIND - got OAuth response"+JSON.stringify(oauth, null, '    '));
        req.connection.api = rest.api(oauth, function(callback){
            console.log("BIND - refreshing token");
            oauth.login(username, password, options, callback, function(e) {
                console.log('Error ' + e);
                // eek - what now?
            })
        });
        res.end();
    },
    function(e) {
        console.log('Error ' + JSON.stringify(e, null, '    '));
        return next(new ldap.InvalidCredentialsError());
    });
});

server.listen(1389,
function() {
    console.log('ldapjs listening at ' + server.url);
});