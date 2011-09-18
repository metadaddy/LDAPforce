var ldap = require('ldapjs'),
    oauth = require('./oauth'),
    rest = require('./rest'),
    fs = require('fs');

var server = ldap.createServer();
var SUFFIX = 'dc=salesforce, dc=com';
var debug = process.env.DEBUG;

function debugOut(o) {
    if (debug)
        console.log(o);
}

// These are the mappings from LDAP object classes to Force.com object types.
// Each entry in ldapToObject is indexed by the Force.com object type and 
// contains the corresponding LDAP object classes and a mapping of LDAP attribute
// names to Force.com field names
var ldapToObject;

// load mappings
var configFile = process.env.CONFIG_FILE || __dirname + '/mappings.json';
try {
    ldapToObject = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    debugOut("Loaded mappings:");
    debugOut(ldapToObject);
} catch (err) {
    console.log("Error loading mappings from "+configFile+": "+err.type);
    process.exit(1);
}

// make inverse mappings
var objectToLdap = {};
for (var objtype in ldapToObject) {
    for (var key in ldapToObject[objtype].mappings) {
        value = ldapToObject[objtype].mappings[key];
        if (!objectToLdap[objtype]) {
            objectToLdap[objtype] = {}
        }
        if (objectToLdap[objtype][value]) {
            objectToLdap[objtype][value].push(key);
        } else {        
            objectToLdap[objtype][value] = [key];
        }
    }
}

function makeFieldList(attributes, objtype, objectFields) {
    var fieldList  = ['id'];
    for (var i in attributes) {
        // map LDAP attributes to Force.com fields
        var attribute = ldapToObject[objtype].mappings[attributes[i]] || 
            attributes[i];
        // filter out unknown fields
        if (objectFields.indexOf(attribute) != -1) {
            // filter out dupes
            if ( fieldList.indexOf(attribute) == -1) {
                fieldList.push(attribute);                
            }
        }
    }
    return fieldList;
}

function initObjtypes(res) {
    // Fill an object with the objtypes so we know when we're done
    res.objtypes = {};
    for (var objtype in ldapToObject) {
        res.objtypes[objtype] = true;
    }
}

// mark this objtype as done; if none left to do then end the response
function markTestAndEnd(res, objtype) {
    res.objtypes[objtype] = false;
    var done = true;
    //debugOut("markTestAndEnd: "+objtype);
    //debugOut(res.objtypes);
    for (o in res.objtypes) {
        if (res.objtypes[o]) {
            done = false;
        }
    }
    if (done) {
        res.end();
    }
}

function doQuery(req, res, next, objtype, whereClause) {
    var fieldList = (req.attributes.length == 0) ? 
        req.connection.objectFields[objtype] : 
        makeFieldList(req.attributes, objtype, req.connection.objectFields[objtype]);

    var fields = '';
    for (var i in fieldList) {
        fields += ((i != 0) ? ',' : '') + fieldList[i];
    }
    
    var query = 'SELECT ' + fields + ' FROM ' + objtype + whereClause;
    
    debugOut('query is '+query);
    
    req.connection.api.query(query, function(data) {
        // Capitalized objtype to look nice in DNs
        var cObjtype = objtype.charAt(0).toUpperCase() + objtype.slice(1);

		for (var i in data.records) {
			var obj = {
                dn: 'uid='+data.records[i].Id+', ou='+cObjtype+'s, '+SUFFIX,
                attributes: {
                    objectclass: ldapToObject[objtype].objectclasses.concat(['salesforce'+cObjtype])
                }
            }
            for (key in data.records[i]) {
                if (typeof key === 'string' && key !== 'attributes' && data.records[i][key]) {
                    // Seems like attribute name has to be lower case for
                    // ldapjs to handle them for us
                    var attribute = key.toLowerCase();
                    var value = data.records[i][key].toString();
                
                    obj.attributes[attribute] = value;
                
                    for (var j in objectToLdap[objtype][attribute]) {
                        obj.attributes[objectToLdap[objtype][attribute][j]] = value;
                    }
                }
            }
			res.send(obj);
		}
		markTestAndEnd(res, objtype);
	} , function () {
        // TODO - Figure out the correct error
        return next(new ldap.OperationsError());
	});    
}

function filterToString(objtype, filter) {
    var str;
    
    var attribute = ldapToObject[objtype].mappings[filter.attribute] || filter.attribute;
        
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
            str += ((i != 0) ? 'AND' : '') + '(' + filterToString(objtype, filter.filters[i]) + ')';
        }
        break;
    case 'or':
        str = '';
        for ( var i in filter.filters ) {
            str += ((i != 0) ? 'OR' : '') + '(' + filterToString(objtype, filter.filters[i]) + ')';
        }
        break;
    case 'not':
        str = 'NOT(' + filterToString(objtype, filter.filter) + ')';
        break;
    }
    
    return str;
}

server.search(SUFFIX,
function(req, res, next) {
    debugOut('attributes: ' + JSON.stringify(req.attributes, null, '    '))
    debugOut('base object: ' + JSON.stringify(req.dn, null, '    '));
    debugOut('scope: ' + req.scope);
    //debugOut('filter: ' + JSON.stringify(req.filter, null, '    '));
    
    // Trim the 's' off the ou to get an object type
    var ou = req.dn.rdns[0].ou && 
        req.dn.rdns[0].ou.toLowerCase().substring(0, req.dn.rdns[0].ou.length - 1);
        
    debugOut('ou: ' + ou);
    
    var obj = {};

    initObjtypes(res);
    
    for (var objtype in ldapToObject) {
        if ( (!ou) || ou === objtype ) {
            var whereClause = filterToString(objtype, req.filter);

            if (whereClause) {
                whereClause = ' WHERE ' + whereClause;
            }

            // Need to load objectFields before we can do the query
            if ( req.connection.objectFields && req.connection.objectFields[objtype] ) {
                doQuery(req, res, next, objtype, whereClause);
            } else {
                if ( ! req.connection.objectFields ) {
                    req.connection.objectFields = {};
                }
                // Need a closure here otherwise we'll keep a reference to 
                // the objtype value that can change before we get called back
                req.connection.api.describe(objtype, function(ot) {
                    return function(data) {
                        req.connection.objectFields[ot] = [];
                        for ( var i in data.fields ) {
                            // Attribute names are normalized to lower case in ldapjs
                            req.connection.objectFields[ot].push(data.fields[i].name.toLowerCase());
                        }
                        doQuery(req, res, next, ot, whereClause);                        
                    }
                }(objtype), function () {
                    // TODO - Figure out the correct error
                    return next(new ldap.OperationsError());
                });
            }            
        } else {
            markTestAndEnd(res, objtype);
        }
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
    
    debugOut('BIND - trying login with username ' + username)
    oauth.login(username, password, options,
    function(oauth) {
        debugOut("BIND - got OAuth response"+JSON.stringify(oauth, null, '    '));
        req.connection.api = rest.api(oauth, function(callback){
            debugOut("BIND - refreshing token");
            oauth.login(username, password, options, callback, function(e) {
                debugOut('Error ' + JSON.stringify(e, null, '    '));
                // eek - what now?
            })
        });
        res.end();
    },
    function(e) {
        debugOut('Error ' + JSON.stringify(e, null, '    '));
        return next(new ldap.InvalidCredentialsError());
    });
});

server.listen(1389,
function() {
    debugOut('ldapjs listening at ' + server.url);
});