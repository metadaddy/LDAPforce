LDAPforce
=========

This Node.js app implements an LDAP front end on Salesforce User and (coming soon!) Contact data.

Pre-requisites
--------------

[ldapjs](http://ldapjs.org/)

    npm install ldapjs
    
Usage
-----

To start the server

    node server.js
    
To run a query from command-line `ldapsearch`

    $ ldapsearch -D "username=pat@superpat.com, ou=Users, dc=salesforce, dc=com" -w YOUR_PASSWORD -H ldap://localhost:1389 -x -b "dc=salesforce, dc=com" "(|(cn=p*)(cn=k*))" cn
    
    # extended LDIF
    #
    # LDAPv3
    # base <dc=salesforce, dc=com> with scope subtree
    # filter: (|(cn=p*)(cn=k*))
    # requesting: cn 
    #

    # kazzy@06050000000u7wq.na3.force.com, Users, salesforce.com
    dn: username=kazzy@06050000000u7wq.na3.force.com, ou=Users, dc=salesforce, dc=
     com
    cn: kazzy@06050000000U7wq.na3.force.com

    # pat@superpat.com, Users, salesforce.com
    dn: username=pat@superpat.com, ou=Users, dc=salesforce, dc=com
    cn: Pat Patterson

    # search result
    search: 2
    result: 0 Success

    # numResponses: 3
    # numEntries: 2
    
You can also configure your email client to use LDAPforce. So far, LDAPforce has been tested successfully with

* Mac Mail 4.5

TODO
----

Add support for searching Contacts.
Add support for add/modify/del/compare/