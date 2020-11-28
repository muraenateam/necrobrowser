# Office 365 examples:
curl -X POST -H "Content-Type: application/json" -d @./office365.dumpEmails.json http://localhost:3000/instrument

curl -X POST -H "Content-Type: application/json" -d @./office365.writeEmail.json http://localhost:3000/instrument

# GitHub example:
curl -X POST -H "Content-Type: application/json" -d @./github.plantAndDump.json http://localhost:3000/instrument
